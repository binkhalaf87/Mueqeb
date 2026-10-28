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
      current_provider_id: { Args: Record<PropertyKey, never>; Returns: string };
      is_account_member: { Args: { p_account_id: string }; Returns: boolean };
      is_account_owner: { Args: { p_account_id: string }; Returns: boolean };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
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
      review_provider: {
        Args: { p_action: string; p_provider_id: string; p_reason?: string };
        Returns: undefined;
      };
      submit_provider_for_review: { Args: Record<PropertyKey, never>; Returns: undefined };
    };
    Enums: {
      delegation_platform: "qiwa" | "balady" | "mc" | "none";
      establishment_member_role: "owner" | "member";
      provider_document_type:
        "commercial_register" | "municipal_license" | "manager_id" | "iban_certificate";
      provider_verification_status: "pending" | "approved" | "rejected" | "suspended";
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
      delegation_platform: ["qiwa", "balady", "mc", "none"],
      establishment_member_role: ["owner", "member"],
      provider_document_type: [
        "commercial_register",
        "municipal_license",
        "manager_id",
        "iban_certificate",
      ],
      provider_verification_status: ["pending", "approved", "rejected", "suspended"],
      requester_account_type: ["individual", "establishment"],
      user_role: ["requester", "provider", "admin"],
    },
  },
} as const;
