"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();
  const existing = await getMyProvider(user.id);

  let error;
  if (!existing) {
    ({ error } = await supabase.from("providers").insert({
      profile_id: user.id,
      office_name: officeName,
      cr_number: crNumber,
      municipal_license_number: municipalLicenseNumber,
      cities,
      bio,
    }));
  } else {
    const identityEditable = isEditableStage(providerStage(existing));
    ({ error } = await supabase
      .from("providers")
      .update({
        cities,
        bio,
        ...(identityEditable && {
          office_name: officeName,
          cr_number: crNumber,
          municipal_license_number: municipalLicenseNumber,
        }),
      })
      .eq("id", existing.id));
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
  const supabase = await createClient();

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, doc, { contentType: doc.type, upsert: false });
  if (uploadError) return { message: "تعذّر رفع الملف، حاول مرة أخرى." };

  const meta = {
    storage_path: path,
    file_name: doc.name.slice(0, 200) || `${docType.data}.${ext}`,
    mime_type: doc.type,
    size_bytes: doc.size,
  };
  const { data: previous } = await supabase
    .from("provider_documents")
    .select("id, storage_path")
    .eq("provider_id", provider.id)
    .eq("doc_type", docType.data as ProviderDocumentType)
    .maybeSingle();

  const { error: dbError } = previous
    ? await supabase
        .from("provider_documents")
        .update({ ...meta, uploaded_at: new Date().toISOString() })
        .eq("id", previous.id)
    : await supabase.from("provider_documents").insert({
        ...meta,
        provider_id: provider.id,
        doc_type: docType.data as ProviderDocumentType,
      });

  if (dbError) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
    return { message: "تعذّر حفظ المستند، حاول مرة أخرى." };
  }
  if (previous) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([previous.storage_path]);
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
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_provider_for_review");
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
  const supabase = await createClient();

  const { data: serviceType } = await supabase
    .from("service_types")
    .select("min_fee_halalas")
    .eq("id", serviceTypeId)
    .single();
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
  const { error } =
    typeof serviceId === "string" && serviceId
      ? await supabase
          .from("provider_services")
          .update({ fee_halalas: fee, duration_days: durationDays, notes })
          .eq("id", serviceId)
          .eq("provider_id", provider.id)
      : await supabase.from("provider_services").insert({
          provider_id: provider.id,
          service_type_id: serviceTypeId,
          fee_halalas: fee,
          duration_days: durationDays,
          notes,
        });

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
  const provider = await getMyProvider(user.id);
  if (!provider) return;
  const supabase = await createClient();
  await supabase
    .from("provider_services")
    .update({ active: formData.get("active") === "true" })
    .eq("id", String(formData.get("serviceId")))
    .eq("provider_id", provider.id);
  revalidateProviderPages();
}

export async function deleteProviderService(formData: FormData) {
  const user = await requireRole("provider");
  const provider = await getMyProvider(user.id);
  if (!provider) return;
  const supabase = await createClient();
  await supabase
    .from("provider_services")
    .delete()
    .eq("id", String(formData.get("serviceId")))
    .eq("provider_id", provider.id);
  revalidateProviderPages();
}
