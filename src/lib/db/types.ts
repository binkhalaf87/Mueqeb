// مولَّد بواسطة scripts/gen-types.ts — لا تعدّله يدوياً (npm run db:types)
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          id: number;
          entity: string;
          entity_key: string;
          action: string;
          old_value: Json | null;
          new_value: Json | null;
          reason: string | null;
          actor_id: string | null;
          created_at: string;
        };
      };
      bids: {
        Row: {
          id: string;
          request_id: string;
          provider_id: string;
          fee_halalas: number;
          expected_gov_fees_halalas: number;
          duration_days: number;
          includes: string;
          needs_from_client: string;
          status: Database["public"]["Enums"]["bid_status"];
          created_at: string;
          updated_at: string;
        };
      };
      blocked_messages: {
        Row: {
          id: number;
          request_id: string;
          provider_id: string | null;
          sender_id: string;
          body: string;
          matched_term: string;
          created_at: string;
        };
      };
      delegation_guides: {
        Row: {
          platform: Database["public"]["Enums"]["delegation_platform"];
          title: string;
          steps: string[];
          updated_at: string;
          updated_by: string | null;
        };
      };
      disputes: {
        Row: {
          request_id: string;
          opened_by: string;
          reason: string;
          opened_at: string;
          decision: Database["public"]["Enums"]["dispute_decision"] | null;
          refund_halalas: number | null;
          decision_note: string | null;
          resolved_by: string | null;
          resolved_at: string | null;
        };
      };
      establishment_members: {
        Row: {
          account_id: string;
          user_id: string;
          member_role: Database["public"]["Enums"]["establishment_member_role"];
          created_at: string;
        };
      };
      ledger_entries: {
        Row: {
          id: number;
          journal_id: string;
          order_id: string;
          payment_id: string | null;
          account: Database["public"]["Enums"]["ledger_account"];
          debit_halalas: number;
          credit_halalas: number;
          description: string;
          reverses_journal_id: string | null;
          created_at: string;
          payout_id: string | null;
        };
      };
      messages: {
        Row: {
          id: number;
          request_id: string;
          provider_id: string;
          sender_id: string;
          sender_role: string;
          body: string;
          was_masked: boolean;
          created_at: string;
        };
      };
      order_events: {
        Row: {
          id: number;
          request_id: string;
          from_status: Database["public"]["Enums"]["request_status"] | null;
          to_status: Database["public"]["Enums"]["request_status"];
          actor_id: string | null;
          actor_role: string;
          note: string | null;
          created_at: string;
        };
      };
      orders: {
        Row: {
          id: string;
          request_id: string;
          bid_id: string;
          provider_service_id: string | null;
          provider_id: string;
          fee_halalas: number;
          client_fee_bps: number;
          provider_commission_bps: number;
          client_fee_halalas: number;
          provider_commission_halalas: number;
          provider_net_halalas: number;
          total_paid_halalas: number;
          expected_gov_fees_halalas: number;
          payment_status: Database["public"]["Enums"]["order_payment_status"];
          paid_at: string | null;
          refunded_at: string | null;
          created_at: string;
          refunded_halalas: number;
          provider_payable_halalas: number | null;
          platform_revenue_halalas: number | null;
          settlement: string | null;
          settled_at: string | null;
        };
      };
      payment_webhook_events: {
        Row: {
          gateway: string;
          event_id: string;
          received_at: string;
          payload: Json;
          outcome: string | null;
        };
      };
      payments: {
        Row: {
          id: string;
          order_id: string;
          gateway: string;
          provider_ref: string;
          gateway_payment_id: string | null;
          amount_halalas: number;
          currency: string;
          status: Database["public"]["Enums"]["payment_status"];
          failure_reason: string | null;
          refund_ref: string | null;
          raw_webhook: Json | null;
          created_at: string;
          paid_at: string | null;
          refunded_at: string | null;
          refunded_halalas: number;
        };
      };
      profiles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["user_role"] | null;
          full_name: string;
          phone: string | null;
          city: string | null;
          created_at: string;
          suspended_at: string | null;
          suspension_reason: string | null;
          suspended_by: string | null;
        };
      };
      provider_documents: {
        Row: {
          id: string;
          provider_id: string;
          doc_type: Database["public"]["Enums"]["provider_document_type"];
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          uploaded_at: string;
        };
      };
      provider_payouts: {
        Row: {
          id: string;
          provider_id: string;
          amount_halalas: number;
          bank_reference: string;
          note: string | null;
          paid_by: string;
          created_at: string;
        };
      };
      provider_services: {
        Row: {
          id: string;
          provider_id: string;
          service_type_id: string;
          fee_halalas: number;
          duration_days: number;
          notes: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
      };
      providers: {
        Row: {
          id: string;
          profile_id: string;
          office_name: string;
          cr_number: string;
          municipal_license_number: string;
          cities: string[];
          bio: string | null;
          verification_status: Database["public"]["Enums"]["provider_verification_status"];
          rejection_reason: string | null;
          submitted_at: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      request_documents: {
        Row: {
          id: string;
          request_id: string;
          kind: Database["public"]["Enums"]["request_document_kind"];
          label: string;
          storage_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          uploaded_by: string;
          created_at: string;
        };
      };
      request_private_details: {
        Row: {
          request_id: string;
          contact_name: string;
          contact_phone: string | null;
          contact_email: string | null;
          establishment_name: string | null;
          cr_number: string | null;
          private_notes: string | null;
          created_at: string;
        };
      };
      requester_accounts: {
        Row: {
          id: string;
          account_type: Database["public"]["Enums"]["requester_account_type"];
          establishment_name: string | null;
          cr_number: string | null;
          created_by: string;
          created_at: string;
          about: string | null;
        };
      };
      reviews: {
        Row: {
          id: string;
          request_id: string;
          reviewer_role: string;
          reviewer_id: string;
          provider_id: string;
          requester_account_id: string;
          speed: number | null;
          accuracy: number | null;
          communication: number | null;
          comment: string | null;
          request_clarity: number | null;
          documents_speed: number | null;
          created_at: string;
        };
      };
      service_categories: {
        Row: {
          id: string;
          slug: string;
          name_ar: string;
          sort_order: number;
          active: boolean;
          created_at: string;
        };
      };
      service_requests: {
        Row: {
          id: string;
          requester_account_id: string;
          service_type_id: string;
          mode: Database["public"]["Enums"]["request_mode"];
          target_provider_id: string | null;
          city: string;
          urgency: Database["public"]["Enums"]["request_urgency"];
          description: string;
          available_docs: string[];
          status: Database["public"]["Enums"]["request_status"];
          bids_deadline: string | null;
          awarded_bid_id: string | null;
          published_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          delegation_confirmed_at: string | null;
          started_at: string | null;
          due_at: string | null;
          delivered_at: string | null;
          delivery_note: string | null;
          closed_at: string | null;
          is_late: boolean;
        };
      };
      service_types: {
        Row: {
          id: string;
          category_id: string;
          slug: string;
          name_ar: string;
          description: string | null;
          min_fee_halalas: number;
          guide_min_halalas: number;
          guide_max_halalas: number;
          required_docs: string[];
          delegation_platform: Database["public"]["Enums"]["delegation_platform"];
          sort_order: number;
          active: boolean;
          created_at: string;
        };
      };
      settings: {
        Row: {
          key: string;
          value: Json;
          description: string | null;
          updated_at: string;
        };
      };
    };
    Enums: {
      bid_status: "submitted" | "withdrawn" | "accepted" | "rejected";
      delegation_platform: "qiwa" | "balady" | "mc" | "none";
      dispute_decision: "provider" | "full_refund" | "partial_refund";
      establishment_member_role: "owner" | "member";
      ledger_account:
        "client" | "escrow" | "platform_revenue" | "provider_payable" | "provider_paid";
      order_payment_status: "unpaid" | "paid" | "refunded" | "partially_refunded";
      payment_status: "initiated" | "paid" | "failed" | "refunded" | "partially_refunded";
      provider_document_type:
        "commercial_register" | "municipal_license" | "manager_id" | "iban_certificate";
      provider_verification_status: "pending" | "approved" | "rejected" | "suspended";
      request_document_kind: "client_document" | "delivery_proof";
      request_mode: "direct_listed" | "direct_quote" | "public";
      request_status:
        | "draft"
        | "open"
        | "awarded_unpaid"
        | "paid"
        | "awaiting_client"
        | "in_progress"
        | "delivered"
        | "completed"
        | "disputed"
        | "resolved"
        | "cancelled"
        | "expired";
      request_urgency: "normal" | "urgent";
      requester_account_type: "individual" | "establishment";
      user_role: "requester" | "provider" | "admin";
    };
    Functions: {
      accept_bid: { Args: { p_bid_id: string }; Returns: undefined };
      admin_kpis: { Args: Record<string, never>; Returns: Json };
      blocked_term_in: { Args: { p_text: string }; Returns: string };
      can_access_thread: {
        Args: { p_request_id: string; p_provider_id: string };
        Returns: boolean;
      };
      cancel_after_start: {
        Args: { p_request_id: string; p_refund_ref: string; p_actor_id: string; p_actor?: string };
        Returns: number;
      };
      cancellation_after_start_refund: { Args: { p_request_id: string }; Returns: number };
      complete_onboarding: {
        Args: {
          p_role: Database["public"]["Enums"]["user_role"];
          p_account_type?: Database["public"]["Enums"]["requester_account_type"];
          p_establishment_name?: string;
          p_cr_number?: string;
          p_city?: string;
        };
        Returns: undefined;
      };
      confirm_completion: { Args: { p_request_id: string }; Returns: undefined };
      confirm_delegation: { Args: { p_request_id: string }; Returns: undefined };
      contains_contact_info: { Args: { p_text: string }; Returns: boolean };
      create_order_for_request: { Args: { p_request_id: string }; Returns: string };
      create_service_request: {
        Args: {
          p_requester_account_id: string;
          p_service_type_id: string;
          p_mode: Database["public"]["Enums"]["request_mode"];
          p_city: string;
          p_urgency?: Database["public"]["Enums"]["request_urgency"];
          p_description?: string;
          p_available_docs?: string[];
          p_target_provider_id?: string;
          p_private_notes?: string;
        };
        Returns: string;
      };
      current_provider_id: { Args: Record<string, never>; Returns: string };
      current_provider_is_approved: { Args: Record<string, never>; Returns: boolean };
      current_user_email: { Args: Record<string, never>; Returns: string };
      expire_stale_requests: { Args: Record<string, never>; Returns: number };
      format_sar: { Args: { p_halalas: number }; Returns: string };
      int_setting: { Args: { p_key: string }; Returns: number };
      is_account_member: { Args: { p_account_id: string }; Returns: boolean };
      is_account_owner: { Args: { p_account_id: string }; Returns: boolean };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_awarded_provider: { Args: { p_request_id: string }; Returns: boolean };
      is_request_member: { Args: { p_request_id: string }; Returns: boolean };
      ledger_account_balances: {
        Args: Record<string, never>;
        Returns: {
          account: Database["public"]["Enums"]["ledger_account"];
          debit_halalas: number;
          credit_halalas: number;
          balance_halalas: number;
        }[];
      };
      ledger_transfer: {
        Args: {
          p_order_id: string;
          p_payment_id: string;
          p_from: Database["public"]["Enums"]["ledger_account"];
          p_to: Database["public"]["Enums"]["ledger_account"];
          p_amount: number;
          p_description: string;
          p_reverses?: string;
        };
        Returns: string;
      };
      mask_contact_info: { Args: { p_text: string }; Returns: string };
      mentions_credentials: { Args: { p_text: string }; Returns: boolean };
      my_login: { Args: Record<string, never>; Returns: { email: string; phone: string }[] };
      my_provider_earnings: { Args: Record<string, never>; Returns: Json };
      open_dispute: { Args: { p_request_id: string; p_reason: string }; Returns: undefined };
      order_ledger_balances: {
        Args: { p_order_id: string };
        Returns: {
          account: Database["public"]["Enums"]["ledger_account"];
          debit_halalas: number;
          credit_halalas: number;
          balance_halalas: number;
        }[];
      };
      pct_to_bps: { Args: { p_pct: Json }; Returns: number };
      provider_can_view_request: { Args: { p_request_id: string }; Returns: boolean };
      provider_is_editable: { Args: { p_provider_id: string }; Returns: boolean };
      provider_payable_by_order: {
        Args: { p_provider_id: string };
        Returns: { order_id: string; balance_halalas: number }[];
      };
      provider_payables: {
        Args: Record<string, never>;
        Returns: {
          provider_id: string;
          office_name: string;
          cr_number: string;
          outstanding_halalas: number;
          orders_count: number;
          paid_out_halalas: number;
          last_payout_at: string;
        }[];
      };
      provider_reviews: {
        Args: { p_provider_id: string; p_limit?: number };
        Returns: {
          id: string;
          speed: number;
          accuracy: number;
          communication: number;
          comment: string;
          created_at: string;
          service_name: string;
        }[];
      };
      provider_stats: {
        Args: { p_provider_ids: string[] };
        Returns: {
          provider_id: string;
          completed_orders: number;
          reviews_count: number;
          avg_rating: number;
          avg_speed: number;
          avg_accuracy: number;
          avg_communication: number;
          on_time_pct: number;
          late_orders: number;
          avg_response_minutes: number;
          dispute_pct: number;
        }[];
      };
      public_provider: {
        Args: { p_provider_id: string };
        Returns: {
          id: string;
          office_name: string;
          cities: string[];
          bio: string;
          approved_since: string;
        }[];
      };
      public_provider_services: {
        Args: { p_provider_id: string };
        Returns: {
          id: string;
          service_type_id: string;
          service_name: string;
          category_name: string;
          fee_halalas: number;
          duration_days: number;
          notes: string;
        }[];
      };
      public_providers: {
        Args: { p_service_type_id?: string; p_city?: string };
        Returns: {
          id: string;
          office_name: string;
          cities: string[];
          bio: string;
          services_count: number;
          from_fee_halalas: number;
        }[];
      };
      record_payment_result: {
        Args: {
          p_gateway: string;
          p_event_id: string;
          p_provider_ref: string;
          p_status: string;
          p_amount_halalas: number;
          p_currency: string;
          p_gateway_payment_id: string;
          p_raw: Json;
        };
        Returns: string;
      };
      record_provider_payout: {
        Args: {
          p_provider_id: string;
          p_expected_halalas: number;
          p_bank_reference: string;
          p_admin_id: string;
          p_note?: string;
        };
        Returns: string;
      };
      record_refund: {
        Args: {
          p_payment_id: string;
          p_refund_ref: string;
          p_amount_halalas: number;
          p_raw: Json;
          p_cancel_request: boolean;
          p_note?: string;
        };
        Returns: string;
      };
      register_payment_attempt: {
        Args: {
          p_order_id: string;
          p_gateway: string;
          p_provider_ref: string;
          p_amount_halalas: number;
        };
        Returns: string;
      };
      request_bids: {
        Args: { p_request_id: string };
        Returns: {
          id: string;
          provider_id: string;
          office_name: string;
          fee_halalas: number;
          expected_gov_fees_halalas: number;
          duration_days: number;
          includes: string;
          needs_from_client: string;
          status: Database["public"]["Enums"]["bid_status"];
          submitted_at: string;
          response_minutes: number;
          completed_orders: number;
          rating: number;
          reviews_count: number;
          on_time_pct: number;
          dispute_pct: number;
        }[];
      };
      requester_stats_for_request: {
        Args: { p_request_id: string };
        Returns: { avg_rating: number; reviews_count: number; completed_requests: number }[];
      };
      resolve_dispute: {
        Args: {
          p_request_id: string;
          p_decision: Database["public"]["Enums"]["dispute_decision"];
          p_refund_halalas: number;
          p_refund_ref: string;
          p_admin_id: string;
          p_note: string;
        };
        Returns: undefined;
      };
      review_provider: {
        Args: { p_provider_id: string; p_action: string; p_reason?: string };
        Returns: undefined;
      };
      reviews_revealed: { Args: { p_request_id: string }; Returns: boolean };
      round_bps: { Args: { p_amount: number; p_bps: number }; Returns: number };
      run_order_maintenance: { Args: Record<string, never>; Returns: Json };
      send_message: {
        Args: { p_request_id: string; p_provider_id: string; p_body: string };
        Returns: Json;
      };
      set_user_suspension: {
        Args: { p_profile_id: string; p_suspend: boolean; p_reason: string; p_admin_id: string };
        Returns: undefined;
      };
      settle_order_ledger: {
        Args: {
          p_order_id: string;
          p_refund_halalas: number;
          p_refund_ref: string;
          p_settlement: string;
        };
        Returns: undefined;
      };
      start_execution: { Args: { p_request_id: string }; Returns: undefined };
      submit_bid: {
        Args: {
          p_request_id: string;
          p_fee_halalas: number;
          p_expected_gov_fees_halalas: number;
          p_duration_days: number;
          p_includes?: string;
          p_needs_from_client?: string;
        };
        Returns: string;
      };
      submit_delivery: { Args: { p_request_id: string; p_note: string }; Returns: undefined };
      submit_provider_for_review: { Args: Record<string, never>; Returns: undefined };
      submit_review: {
        Args: {
          p_request_id: string;
          p_speed?: number;
          p_accuracy?: number;
          p_communication?: number;
          p_comment?: string;
          p_request_clarity?: number;
          p_documents_speed?: number;
        };
        Returns: undefined;
      };
      transition_request: {
        Args: {
          p_request_id: string;
          p_to: Database["public"]["Enums"]["request_status"];
          p_note?: string;
        };
        Returns: undefined;
      };
      transition_request_as: {
        Args: {
          p_request_id: string;
          p_to: Database["public"]["Enums"]["request_status"];
          p_actor: string;
          p_actor_id: string;
          p_note?: string;
        };
        Returns: undefined;
      };
      withdraw_bid: { Args: { p_bid_id: string }; Returns: undefined };
    };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];
export type FunctionName = keyof Database["public"]["Functions"];
export type FunctionArgs<F extends FunctionName> = Database["public"]["Functions"][F]["Args"];
export type FunctionReturns<F extends FunctionName> = Database["public"]["Functions"][F]["Returns"];
