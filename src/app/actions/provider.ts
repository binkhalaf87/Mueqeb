"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db/server";
import { attempt } from "@/lib/db/core";
import { removeObjects, uploadObject } from "@/lib/storage";
import { fieldErrors } from "@/lib/auth/validation";
import { formatHalalas } from "@/lib/money";
import { getMyProvider } from "@/lib/providers/queries";
import {
  ALLOWED_DOCUMENT_MIME,
  DOCUMENTS_BUCKET,
  isEditableStage,
  providerStage,
  type ProviderDocumentType,
} from "@/lib/providers/constants";
import {
  documentTypeSchema,
  providerProfileSchema,
  providerServiceSchema,
  validateDocumentFile,
} from "@/lib/providers/validation";
import { isUuid, uuidField } from "@/lib/validation";
import type { FormState } from "./auth";

function revalidateProviderPages() {
  revalidatePath("/dashboard/provider", "layout");
  revalidatePath("/providers", "layout");
}

export async function saveProviderProfile(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireRole("provider");
  const parsed = providerProfileSchema.safeParse({
    officeName: formData.get("officeName"),
    crNumber: formData.get("crNumber"),
    municipalLicenseNumber: formData.get("municipalLicenseNumber"),
    cities: formData.getAll("cities"),
    bio: formData.get("bio") ?? undefined,
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { officeName, crNumber, municipalLicenseNumber, cities, bio } = parsed.data;
  const db = await getDb();
  const existing = await getMyProvider(user.id);

  let error;
  if (!existing) {
    ({ error } = await attempt(
      db.query(
        `insert into public.providers
           (profile_id, office_name, cr_number, municipal_license_number, cities, bio)
         values ($1, $2, $3, $4, $5, $6)`,
        [user.id, officeName, crNumber, municipalLicenseNumber, cities, bio ?? null],
      ),
    ));
  } else if (isEditableStage(providerStage(existing))) {
    ({ error } = await attempt(
      db.query(
        `update public.providers
         set cities = $2, bio = $3, office_name = $4, cr_number = $5, municipal_license_number = $6
         where id = $1`,
        [existing.id, cities, bio ?? null, officeName, crNumber, municipalLicenseNumber],
      ),
    ));
  } else {
    // بعد الإرسال أو الاعتماد: الهوية (الاسم والسجل والرخصة) ثابتة
    ({ error } = await attempt(
      db.query("update public.providers set cities = $2, bio = $3 where id = $1", [
        existing.id,
        cities,
        bio ?? null,
      ]),
    ));
  }

  if (error) {
    if (error.code === "23505") {
      return { errors: { crNumber: "رقم السجل التجاري مسجّل لمكتب آخر." } };
    }
    return { message: "تعذّر حفظ الملف، حاول مرة أخرى." };
  }

  revalidateProviderPages();
  return { message: "حُفظ الملف." };
}

export async function uploadProviderDocument(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireRole("provider");
  const provider = await getMyProvider(user.id);
  if (!provider) return { message: "احفظ بيانات المكتب أولاً." };
  if (!isEditableStage(providerStage(provider))) {
    return { message: "لا يمكن تغيير المستندات أثناء المراجعة أو بعد الاعتماد." };
  }

  const docType = documentTypeSchema.safeParse(formData.get("docType"));
  if (!docType.success) return { message: "نوع المستند غير صحيح." };
  const file = formData.get("file");
  const fileError = validateDocumentFile(file);
  if (fileError) return { errors: { file: fileError } };
  const doc = file as File;

  const ext = ALLOWED_DOCUMENT_MIME[doc.type as keyof typeof ALLOWED_DOCUMENT_MIME];
  const path = `${provider.id}/${docType.data}-${randomUUID()}.${ext}`;
  const db = await getDb();

  const { error: uploadError } = await uploadObject(db, DOCUMENTS_BUCKET, path, doc);
  if (uploadError) return { message: "تعذّر رفع الملف، حاول مرة أخرى." };

  const meta = {
    storage_path: path,
    file_name: doc.name.slice(0, 200) || `${docType.data}.${ext}`,
    mime_type: doc.type,
    size_bytes: doc.size,
  };
  const previous = await db.maybeOne<{ id: string; storage_path: string }>(
    "select id, storage_path from public.provider_documents where provider_id = $1 and doc_type = $2",
    [provider.id, docType.data as ProviderDocumentType],
  );

  const { error: dbError } = previous
    ? await attempt(
        db.query(
          `update public.provider_documents
           set storage_path = $2, file_name = $3, mime_type = $4, size_bytes = $5, uploaded_at = now()
           where id = $1`,
          [previous.id, meta.storage_path, meta.file_name, meta.mime_type, meta.size_bytes],
        ),
      )
    : await attempt(
        db.query(
          `insert into public.provider_documents
             (provider_id, doc_type, storage_path, file_name, mime_type, size_bytes)
           values ($1, $2, $3, $4, $5, $6)`,
          [
            provider.id,
            docType.data as ProviderDocumentType,
            meta.storage_path,
            meta.file_name,
            meta.mime_type,
            meta.size_bytes,
          ],
        ),
      );

  if (dbError) {
    await removeObjects(db, DOCUMENTS_BUCKET, [path]);
    return { message: "تعذّر حفظ المستند، حاول مرة أخرى." };
  }
  if (previous) {
    await removeObjects(db, DOCUMENTS_BUCKET, [previous.storage_path]);
  }

  revalidateProviderPages();
  return { message: "رُفع المستند." };
}

const SUBMIT_ERRORS: Record<string, string> = {
  documents_incomplete: "ارفع المستندات الأربعة قبل الإرسال.",
  cities_required: "اختر المدن التي تخدمها.",
  invalid_status: "لا يمكن الإرسال في الحالة الحالية.",
  provider_not_found: "احفظ بيانات المكتب أولاً.",
};

export async function submitProviderForReview(): Promise<FormState> {
  await requireRole("provider");
  const db = await getDb();
  const { error } = await db.rpc("submit_provider_for_review");
  if (error) {
    const key = Object.keys(SUBMIT_ERRORS).find((k) => error.message.includes(k));
    return { message: key ? SUBMIT_ERRORS[key] : "تعذّر الإرسال، حاول مرة أخرى." };
  }
  revalidateProviderPages();
  revalidatePath("/admin", "layout");
  return { message: "أُرسل ملفك للتوثيق." };
}

export async function saveProviderService(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireRole("provider");
  const provider = await getMyProvider(user.id);
  if (!provider) return { message: "أكمل ملف المكتب أولاً." };

  const values = {
    serviceTypeId: String(formData.get("serviceTypeId") ?? ""),
    fee: String(formData.get("fee") ?? ""),
    durationDays: String(formData.get("durationDays") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  };
  const parsed = providerServiceSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const { serviceTypeId, fee, durationDays, notes } = parsed.data;
  const db = await getDb();

  const serviceType = await db.maybeOne<{ min_fee_halalas: number }>(
    "select min_fee_halalas from public.service_types where id = $1",
    [serviceTypeId],
  );
  if (!serviceType) return { errors: { serviceTypeId: "خدمة غير معروفة" }, values };
  if (fee < serviceType.min_fee_halalas) {
    return {
      errors: {
        fee: `الحد الأدنى لأتعاب هذه الخدمة ${formatHalalas(serviceType.min_fee_halalas)}`,
      },
      values,
    };
  }

  const serviceId = formData.get("serviceId");
  if (serviceId && !isUuid(serviceId)) return { message: "خدمة غير صالحة.", values };
  const { error } = isUuid(serviceId)
    ? await attempt(
        db.query(
          `update public.provider_services
             set fee_halalas = $3, duration_days = $4, notes = $5
             where id = $1 and provider_id = $2`,
          [serviceId, provider.id, fee, durationDays, notes ?? null],
        ),
      )
    : await attempt(
        db.query(
          `insert into public.provider_services
               (provider_id, service_type_id, fee_halalas, duration_days, notes)
             values ($1, $2, $3, $4, $5)`,
          [provider.id, serviceTypeId, fee, durationDays, notes ?? null],
        ),
      );

  if (error) {
    if (error.code === "23505") {
      return { errors: { serviceTypeId: "أضفت هذه الخدمة مسبقاً، عدّلها من القائمة." }, values };
    }
    if (error.message.includes("fee_below_minimum")) {
      return { errors: { fee: "السعر أقل من الحد الأدنى لهذه الخدمة." }, values };
    }
    return { message: "تعذّر حفظ الخدمة، حاول مرة أخرى.", values };
  }

  revalidateProviderPages();
  return { message: "حُفظت الخدمة." };
}

export async function setProviderServiceActive(formData: FormData) {
  const user = await requireRole("provider");
  const serviceId = uuidField(formData, "serviceId");
  const provider = await getMyProvider(user.id);
  if (!provider || !serviceId) return;
  const db = await getDb();
  await attempt(
    db.query("update public.provider_services set active = $3 where id = $1 and provider_id = $2", [
      serviceId,
      provider.id,
      formData.get("active") === "true",
    ]),
  );
  revalidateProviderPages();
}

export async function deleteProviderService(formData: FormData) {
  const user = await requireRole("provider");
  const serviceId = uuidField(formData, "serviceId");
  const provider = await getMyProvider(user.id);
  if (!provider || !serviceId) return;
  const db = await getDb();
  await attempt(
    db.query("delete from public.provider_services where id = $1 and provider_id = $2", [
      serviceId,
      provider.id,
    ]),
  );
  revalidateProviderPages();
}
