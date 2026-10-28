export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      bids: {
        Row: {
          created_at: string;
          duration_days: number;
          expected_gov_fees_halalas: number;
          fee_halalas: number;
          id: string;
          includes: string;
          needs_from_client: string;
          provider_id: string;
          request_id: string;
          status: Database["public"]["Enums"]["bid_status"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          duration_days: number;
          expected_gov_fees_halalas?: number;
          fee_halalas: number;
          id?: string;
          includes?: string;
          needs_from_client?: string;
          provider_id: string;
          request_id: string;
          status?: Database["public"]["Enums"]["bid_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          duration_days?: number;
          expected_gov_fees_halalas?: number;
          fee_halalas?: number;
          id?: string;
          includes?: string;
          needs_from_client?: string;
          provider_id?: string;
          request_id?: string;
          status?: Database["public"]["Enums"]["bid_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bids_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bids_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "service_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      establishment_members: {
        Row: {
          account_id: string;
          created_at: string;
          member_role: Database["public"]["Enums"]["establishment_member_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          account_id: string;
          created_at?: string;
          member_role?: Database["public"]["Enums"]["establishment_member_role"];
          user_id: string;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          member_role?: Database["public"]["Enums"]["establishment_member_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "establishment_members_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "requester_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "establishment_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ledger_entries: {
        Row: {
          account: Database["public"]["Enums"]["ledger_account"];
          created_at: string;
          credit_halalas: number;
          debit_halalas: number;
          description: string;
          id: number;
          journal_id: string;
          order_id: string;
          payment_id: string | null;
          reverses_journal_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          account: Database["public"]["Enums"]["ledger_account"];
          created_at?: string;
          credit_halalas?: number;
          debit_halalas?: number;
          description: string;
          id?: never;
          journal_id: string;
          order_id: string;
          payment_id?: string | null;
          reverses_journal_id?: string | null;
        };
        Update: {
          account?: Database["public"]["Enums"]["ledger_account"];
          created_at?: string;
          credit_halalas?: number;
          debit_halalas?: number;
          description?: string;
          id?: never;
          journal_id?: string;
          order_id?: string;
          payment_id?: string | null;
          reverses_journal_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ledger_entries_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
        ];
      };
      order_events: {
        Row: {
          actor_id: string | null;
          actor_role: string;
          created_at: string;
          from_status: Database["public"]["Enums"]["request_status"] | null;
          id: number;
          note: string | null;
          request_id: string;
          to_status: Database["public"]["Enums"]["request_status"];
        };
        ComputedFields: never;
        Insert: {
          actor_id?: string | null;
          actor_role: string;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["request_status"] | null;
          id?: never;
          note?: string | null;
          request_id: string;
          to_status: Database["public"]["Enums"]["request_status"];
        };
        Update: {
          actor_id?: string | null;
          actor_role?: string;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["request_status"] | null;
          id?: never;
          note?: string | null;
          request_id?: string;
          to_status?: Database["public"]["Enums"]["request_status"];
        };
        Relationships: [
          {
            foreignKeyName: "order_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_events_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "service_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          bid_id: string;
          client_fee_bps: number;
          client_fee_halalas: number;
          created_at: string;
          expected_gov_fees_halalas: number;
          fee_halalas: number;
          id: string;
          paid_at: string | null;
          payment_status: Database["public"]["Enums"]["order_payment_status"];
          provider_commission_bps: number;
          provider_commission_halalas: number;
          provider_id: string;
          provider_net_halalas: number;
          provider_service_id: string | null;
          refunded_at: string | null;
          request_id: string;
          total_paid_halalas: number;
        };
        ComputedFields: never;
        Insert: {
          bid_id: string;
          client_fee_bps: number;
          client_fee_halalas: number;
          created_at?: string;
          expected_gov_fees_halalas?: number;
          fee_halalas: number;
          id?: string;
          paid_at?: string | null;
          payment_status?: Database["public"]["Enums"]["order_payment_status"];
          provider_commission_bps: number;
          provider_commission_halalas: number;
          provider_id: string;
          provider_net_halalas: number;
          provider_service_id?: string | null;
          refunded_at?: string | null;
          request_id: string;
          total_paid_halalas: number;
        };
        Update: {
          bid_id?: string;
          client_fee_bps?: number;
          client_fee_halalas?: number;
          created_at?: string;
          expected_gov_fees_halalas?: number;
          fee_halalas?: number;
          id?: string;
          paid_at?: string | null;
          payment_status?: Database["public"]["Enums"]["order_payment_status"];
          provider_commission_bps?: number;
          provider_commission_halalas?: number;
          provider_id?: string;
          provider_net_halalas?: number;
          provider_service_id?: string | null;
          refunded_at?: string | null;
          request_id?: string;
          total_paid_halalas?: number;
        };
        Relationships: [
          {
            foreignKeyName: "orders_bid_id_fkey";
            columns: ["bid_id"];
            isOneToOne: false;
            referencedRelation: "bids";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_provider_service_id_fkey";
            columns: ["provider_service_id"];
            isOneToOne: false;
            referencedRelation: "provider_services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: true;
            referencedRelation: "service_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_webhook_events: {
        Row: {
          event_id: string;
          gateway: string;
          outcome: string | null;
          payload: NonNullable<Json>;
          received_at: string;
        };
        ComputedFields: never;
        Insert: {
          event_id: string;
          gateway: string;
          outcome?: string | null;
          payload: NonNullable<Json>;
          received_at?: string;
        };
        Update: {
          event_id?: string;
          gateway?: string;
          outcome?: string | null;
          payload?: NonNullable<Json>;
          received_at?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          amount_halalas: number;
          created_at: string;
          currency: string;
          failure_reason: string | null;
          gateway: string;
          gateway_payment_id: string | null;
          id: string;
          order_id: string;
          paid_at: string | null;
          provider_ref: string;
          raw_webhook: Json | null;
          refund_ref: string | null;
          refunded_at: string | null;
          status: Database["public"]["Enums"]["payment_status"];
        };
        ComputedFields: never;
        Insert: {
          amount_halalas: number;
          created_at?: string;
          currency?: string;
          failure_reason?: string | null;
          gateway: string;
          gateway_payment_id?: string | null;
          id?: string;
          order_id: string;
          paid_at?: string | null;
          provider_ref: string;
          raw_webhook?: Json | null;
          refund_ref?: string | null;
          refunded_at?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
        };
        Update: {
          amount_halalas?: number;
          created_at?: string;
          currency?: string;
          failure_reason?: string | null;
          gateway?: string;
          gateway_payment_id?: string | null;
          id?: string;
          order_id?: string;
          paid_at?: string | null;
          provider_ref?: string;
          raw_webhook?: Json | null;
          refund_ref?: string | null;
          refunded_at?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
        };
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          city: string | null;
          created_at: string;
          full_name: string;
          id: string;
          phone: string | null;
          role: Database["public"]["Enums"]["user_role"] | null;
        };
        ComputedFields: never;
        Insert: {
          city?: string | null;
          created_at?: string;
          full_name?: string;
          id: string;
          phone?: string | null;
          role?: Database["public"]["Enums"]["user_role"] | null;
        };
        Update: {
          city?: string | null;
          created_at?: string;
          full_name?: string;
          id?: string;
          phone?: string | null;
          role?: Database["public"]["Enums"]["user_role"] | null;
        };
        Relationships: [];
      };
      provider_documents: {
        Row: {
          doc_type: Database["public"]["Enums"]["provider_document_type"];
          file_name: string;
          id: string;
          mime_type: string;
          provider_id: string;
          size_bytes: number;
          storage_path: string;
          uploaded_at: string;
        };
        ComputedFields: never;
        Insert: {
          doc_type: Database["public"]["Enums"]["provider_document_type"];
          file_name: string;
          id?: string;
          mime_type: string;
          provider_id: string;
          size_bytes: number;
          storage_path: string;
          uploaded_at?: string;
        };
        Update: {
          doc_type?: Database["public"]["Enums"]["provider_document_type"];
          file_name?: string;
          id?: string;
          mime_type?: string;
          provider_id?: string;
          size_bytes?: number;
          storage_path?: string;
          uploaded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_documents_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
        ];
      };
      provider_services: {
        Row: {
          active: boolean;
          created_at: string;
          duration_days: number;
          fee_halalas: number;
          id: string;
          notes: string | null;
          provider_id: string;
          service_type_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          duration_days: number;
          fee_halalas: number;
          id?: string;
          notes?: string | null;
          provider_id: string;
          service_type_id: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          duration_days?: number;
          fee_halalas?: number;
          id?: string;
          notes?: string | null;
          provider_id?: string;
          service_type_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "provider_services_provider_id_fkey";
            columns: ["provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "provider_services_service_type_id_fkey";
            columns: ["service_type_id"];
            isOneToOne: false;
            referencedRelation: "service_types";
            referencedColumns: ["id"];
          },
        ];
      };
      providers: {
        Row: {
          bio: string | null;
          cities: string[];
          cr_number: string;
          created_at: string;
          id: string;
          municipal_license_number: string;
          office_name: string;
          profile_id: string;
          rejection_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          submitted_at: string | null;
          updated_at: string;
          verification_status: Database["public"]["Enums"]["provider_verification_status"];
        };
        ComputedFields: never;
        Insert: {
          bio?: string | null;
          cities?: string[];
          cr_number: string;
          created_at?: string;
          id?: string;
          municipal_license_number: string;
          office_name: string;
          profile_id: string;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          submitted_at?: string | null;
          updated_at?: string;
          verification_status?: Database["public"]["Enums"]["provider_verification_status"];
        };
        Update: {
          bio?: string | null;
          cities?: string[];
          cr_number?: string;
          created_at?: string;
          id?: string;
          municipal_license_number?: string;
          office_name?: string;
          profile_id?: string;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          submitted_at?: string | null;
          updated_at?: string;
          verification_status?: Database["public"]["Enums"]["provider_verification_status"];
        };
        Relationships: [
          {
            foreignKeyName: "providers_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "providers_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      request_private_details: {
        Row: {
          contact_email: string | null;
          contact_name: string;
          contact_phone: string | null;
          cr_number: string | null;
          created_at: string;
          establishment_name: string | null;
          private_notes: string | null;
          request_id: string;
        };
        ComputedFields: never;
        Insert: {
          contact_email?: string | null;
          contact_name: string;
          contact_phone?: string | null;
          cr_number?: string | null;
          created_at?: string;
          establishment_name?: string | null;
          private_notes?: string | null;
          request_id: string;
        };
        Update: {
          contact_email?: string | null;
          contact_name?: string;
          contact_phone?: string | null;
          cr_number?: string | null;
          created_at?: string;
          establishment_name?: string | null;
          private_notes?: string | null;
          request_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "request_private_details_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: true;
            referencedRelation: "service_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      requester_accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["requester_account_type"];
          cr_number: string | null;
          created_at: string;
          created_by: string;
          establishment_name: string | null;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          account_type: Database["public"]["Enums"]["requester_account_type"];
          cr_number?: string | null;
          created_at?: string;
          created_by: string;
          establishment_name?: string | null;
          id?: string;
        };
        Update: {
          account_type?: Database["public"]["Enums"]["requester_account_type"];
          cr_number?: string | null;
          created_at?: string;
          created_by?: string;
          establishment_name?: string | null;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "requester_accounts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      service_categories: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          name_ar: string;
          slug: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name_ar: string;
          slug: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name_ar?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      service_requests: {
        Row: {
          available_docs: string[];
          awarded_bid_id: string | null;
          bids_deadline: string | null;
          city: string;
          created_at: string;
          created_by: string;
          description: string;
          id: string;
          mode: Database["public"]["Enums"]["request_mode"];
          published_at: string | null;
          requester_account_id: string;
          service_type_id: string;
          status: Database["public"]["Enums"]["request_status"];
          target_provider_id: string | null;
          updated_at: string;
          urgency: Database["public"]["Enums"]["request_urgency"];
        };
        ComputedFields: never;
        Insert: {
          available_docs?: string[];
          awarded_bid_id?: string | null;
          bids_deadline?: string | null;
          city: string;
          created_at?: string;
          created_by: string;
          description?: string;
          id?: string;
          mode: Database["public"]["Enums"]["request_mode"];
          published_at?: string | null;
          requester_account_id: string;
          service_type_id: string;
          status?: Database["public"]["Enums"]["request_status"];
          target_provider_id?: string | null;
          updated_at?: string;
          urgency?: Database["public"]["Enums"]["request_urgency"];
        };
        Update: {
          available_docs?: string[];
          awarded_bid_id?: string | null;
          bids_deadline?: string | null;
          city?: string;
          created_at?: string;
          created_by?: string;
          description?: string;
          id?: string;
          mode?: Database["public"]["Enums"]["request_mode"];
          published_at?: string | null;
          requester_account_id?: string;
          service_type_id?: string;
          status?: Database["public"]["Enums"]["request_status"];
          target_provider_id?: string | null;
          updated_at?: string;
          urgency?: Database["public"]["Enums"]["request_urgency"];
        };
        Relationships: [
          {
            foreignKeyName: "service_requests_awarded_bid_fk";
            columns: ["awarded_bid_id"];
            isOneToOne: false;
            referencedRelation: "bids";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_requests_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_requests_requester_account_id_fkey";
            columns: ["requester_account_id"];
            isOneToOne: false;
            referencedRelation: "requester_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_requests_service_type_id_fkey";
            columns: ["service_type_id"];
            isOneToOne: false;
            referencedRelation: "service_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_requests_target_provider_id_fkey";
            columns: ["target_provider_id"];
            isOneToOne: false;
            referencedRelation: "providers";
            referencedColumns: ["id"];
          },
        ];
      };
      service_types: {
        Row: {
          active: boolean;
          category_id: string;
          created_at: string;
          delegation_platform: Database["public"]["Enums"]["delegation_platform"];
          description: string | null;
          guide_max_halalas: number;
          guide_min_halalas: number;
          id: string;
          min_fee_halalas: number;
          name_ar: string;
          required_docs: string[];
          slug: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          category_id: string;
          created_at?: string;
          delegation_platform?: Database["public"]["Enums"]["delegation_platform"];
          description?: string | null;
          guide_max_halalas: number;
          guide_min_halalas: number;
          id?: string;
          min_fee_halalas: number;
          name_ar: string;
          required_docs?: string[];
          slug: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          category_id?: string;
          created_at?: string;
          delegation_platform?: Database["public"]["Enums"]["delegation_platform"];
          description?: string | null;
          guide_max_halalas?: number;
          guide_min_halalas?: number;
          id?: string;
          min_fee_halalas?: number;
          name_ar?: string;
          required_docs?: string[];
          slug?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "service_types_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "service_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      settings: {
        Row: {
          description: string | null;
          key: string;
          updated_at: string;
          value: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          description?: string | null;
          key: string;
          updated_at?: string;
          value: NonNullable<Json>;
        };
        Update: {
          description?: string | null;
          key?: string;
          updated_at?: string;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_bid: { Args: { p_bid_id: string }; Returns: undefined };
      complete_onboarding: {
        Args: {
          p_account_type?: Database["public"]["Enums"]["requester_account_type"];
          p_city?: string;
          p_cr_number?: string;
          p_establishment_name?: string;
          p_role: Database["public"]["Enums"]["user_role"];
        };
        Returns: undefined;
      };
      contains_contact_info: { Args: { p_text: string }; Returns: boolean };
      create_order_for_request: { Args: { p_request_id: string }; Returns: string };
      create_service_request: {
        Args: {
          p_available_docs?: string[];
          p_city: string;
          p_description?: string;
          p_mode: Database["public"]["Enums"]["request_mode"];
          p_private_notes?: string;
          p_requester_account_id: string;
          p_service_type_id: string;
          p_target_provider_id?: string;
          p_urgency?: Database["public"]["Enums"]["request_urgency"];
        };
        Returns: string;
      };
      current_provider_id: { Args: Record<PropertyKey, never>; Returns: string };
      current_provider_is_approved: { Args: Record<PropertyKey, never>; Returns: boolean };
      expire_stale_requests: { Args: Record<PropertyKey, never>; Returns: number };
      int_setting: { Args: { p_key: string }; Returns: number };
      is_account_member: { Args: { p_account_id: string }; Returns: boolean };
      is_account_owner: { Args: { p_account_id: string }; Returns: boolean };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_awarded_provider: { Args: { p_request_id: string }; Returns: boolean };
      is_request_member: { Args: { p_request_id: string }; Returns: boolean };
      ledger_transfer: {
        Args: {
          p_amount: number;
          p_description: string;
          p_from: Database["public"]["Enums"]["ledger_account"];
          p_order_id: string;
          p_payment_id: string;
          p_reverses?: string;
          p_to: Database["public"]["Enums"]["ledger_account"];
        };
        Returns: string;
      };
      mentions_credentials: { Args: { p_text: string }; Returns: boolean };
      order_ledger_balances: {
        Args: { p_order_id: string };
        Returns: {
          account: Database["public"]["Enums"]["ledger_account"];
          balance_halalas: number;
          credit_halalas: number;
          debit_halalas: number;
        }[];
      };
      pct_to_bps: { Args: { p_pct: Json }; Returns: number };
      provider_can_view_request: { Args: { p_request_id: string }; Returns: boolean };
      provider_is_editable: { Args: { p_provider_id: string }; Returns: boolean };
      public_provider: {
        Args: { p_provider_id: string };
        Returns: {
          approved_since: string;
          bio: string;
          cities: string[];
          id: string;
          office_name: string;
        }[];
      };
      public_provider_services: {
        Args: { p_provider_id: string };
        Returns: {
          category_name: string;
          duration_days: number;
          fee_halalas: number;
          id: string;
          notes: string;
          service_name: string;
          service_type_id: string;
        }[];
      };
      public_providers: {
        Args: { p_city?: string; p_service_type_id?: string };
        Returns: {
          bio: string;
          cities: string[];
          from_fee_halalas: number;
          id: string;
          office_name: string;
          services_count: number;
        }[];
      };
      record_payment_result: {
        Args: {
          p_amount_halalas: number;
          p_currency: string;
          p_event_id: string;
          p_gateway: string;
          p_gateway_payment_id: string;
          p_provider_ref: string;
          p_raw: Json;
          p_status: string;
        };
        Returns: string;
      };
      record_refund: {
        Args: {
          p_amount_halalas: number;
          p_cancel_request: boolean;
          p_note?: string;
          p_payment_id: string;
          p_raw: Json;
          p_refund_ref: string;
        };
        Returns: string;
      };
      register_payment_attempt: {
        Args: {
          p_amount_halalas: number;
          p_gateway: string;
          p_order_id: string;
          p_provider_ref: string;
        };
        Returns: string;
      };
      request_bids: {
        Args: { p_request_id: string };
        Returns: {
          completed_orders: number;
          duration_days: number;
          expected_gov_fees_halalas: number;
          fee_halalas: number;
          id: string;
          includes: string;
          needs_from_client: string;
          office_name: string;
          provider_id: string;
          rating: number;
          response_minutes: number;
          status: Database["public"]["Enums"]["bid_status"];
          submitted_at: string;
        }[];
      };
      review_provider: {
        Args: { p_action: string; p_provider_id: string; p_reason?: string };
        Returns: undefined;
      };
      round_bps: { Args: { p_amount: number; p_bps: number }; Returns: number };
      submit_bid: {
        Args: {
          p_duration_days: number;
          p_expected_gov_fees_halalas: number;
          p_fee_halalas: number;
          p_includes?: string;
          p_needs_from_client?: string;
          p_request_id: string;
        };
        Returns: string;
      };
      submit_provider_for_review: { Args: Record<PropertyKey, never>; Returns: undefined };
      transition_request: {
        Args: {
          p_note?: string;
          p_request_id: string;
          p_to: Database["public"]["Enums"]["request_status"];
        };
        Returns: undefined;
      };
      withdraw_bid: { Args: { p_bid_id: string }; Returns: undefined };
    };
    Enums: {
      bid_status: "submitted" | "withdrawn" | "accepted" | "rejected";
      delegation_platform: "qiwa" | "balady" | "mc" | "none";
      establishment_member_role: "owner" | "member";
      ledger_account:
        "client" | "escrow" | "platform_revenue" | "provider_payable" | "provider_paid";
      order_payment_status: "unpaid" | "paid" | "refunded";
      payment_status: "initiated" | "paid" | "failed" | "refunded";
      provider_document_type:
        "commercial_register" | "municipal_license" | "manager_id" | "iban_certificate";
      provider_verification_status: "pending" | "approved" | "rejected" | "suspended";
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
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      bid_status: ["submitted", "withdrawn", "accepted", "rejected"],
      delegation_platform: ["qiwa", "balady", "mc", "none"],
      establishment_member_role: ["owner", "member"],
      ledger_account: ["client", "escrow", "platform_revenue", "provider_payable", "provider_paid"],
      order_payment_status: ["unpaid", "paid", "refunded"],
      payment_status: ["initiated", "paid", "failed", "refunded"],
      provider_document_type: [
        "commercial_register",
        "municipal_license",
        "manager_id",
        "iban_certificate",
      ],
      provider_verification_status: ["pending", "approved", "rejected", "suspended"],
      request_mode: ["direct_listed", "direct_quote", "public"],
      request_status: [
        "draft",
        "open",
        "awarded_unpaid",
        "paid",
        "awaiting_client",
        "in_progress",
        "delivered",
        "completed",
        "disputed",
        "resolved",
        "cancelled",
        "expired",
      ],
      request_urgency: ["normal", "urgent"],
      requester_account_type: ["individual", "establishment"],
      user_role: ["requester", "provider", "admin"],
    },
  },
} as const;
