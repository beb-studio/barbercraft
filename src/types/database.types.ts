// GENERATED FILE - DO NOT EDIT BY HAND.
// Source of truth: supabase/migrations. Regenerate with `pnpm db:types`.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      accounts: {
        Row: {
          access_token: string | null;
          access_token_expires_at: string | null;
          account_id: string;
          created_at: string;
          id: string;
          id_token: string | null;
          password: string | null;
          provider_id: string;
          refresh_token: string | null;
          refresh_token_expires_at: string | null;
          scope: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          access_token?: string | null;
          access_token_expires_at?: string | null;
          account_id: string;
          created_at: string;
          id?: string;
          id_token?: string | null;
          password?: string | null;
          provider_id: string;
          refresh_token?: string | null;
          refresh_token_expires_at?: string | null;
          scope?: string | null;
          updated_at: string;
          user_id: string;
        };
        Update: {
          access_token?: string | null;
          access_token_expires_at?: string | null;
          account_id?: string;
          created_at?: string;
          id?: string;
          id_token?: string | null;
          password?: string | null;
          provider_id?: string;
          refresh_token?: string | null;
          refresh_token_expires_at?: string | null;
          scope?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "accounts_user_id_users_id_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      appointment_access_tokens: {
        Row: {
          appointment_id: string;
          business_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          revoked_at: string | null;
          token_hash: string;
        };
        Insert: {
          appointment_id: string;
          business_id: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          revoked_at?: string | null;
          token_hash: string;
        };
        Update: {
          appointment_id?: string;
          business_id?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          revoked_at?: string | null;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointment_access_tokens_appointment_fkey";
            columns: ["business_id", "appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      appointments: {
        Row: {
          business_id: string;
          cancellation_reason: string | null;
          created_at: string;
          customer_id: string;
          end_time: string;
          id: string;
          notes: string | null;
          service_duration_snapshot: number;
          service_id: string;
          service_name_snapshot: string;
          service_price_snapshot: number;
          source: Database["public"]["Enums"]["appointment_source"];
          staff_id: string;
          start_time: string;
          status: Database["public"]["Enums"]["appointment_status"];
          updated_at: string;
        };
        Insert: {
          business_id: string;
          cancellation_reason?: string | null;
          created_at?: string;
          customer_id: string;
          end_time: string;
          id?: string;
          notes?: string | null;
          service_duration_snapshot: number;
          service_id: string;
          service_name_snapshot: string;
          service_price_snapshot: number;
          source?: Database["public"]["Enums"]["appointment_source"];
          staff_id: string;
          start_time: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          cancellation_reason?: string | null;
          created_at?: string;
          customer_id?: string;
          end_time?: string;
          id?: string;
          notes?: string | null;
          service_duration_snapshot?: number;
          service_id?: string;
          service_name_snapshot?: string;
          service_price_snapshot?: number;
          source?: Database["public"]["Enums"]["appointment_source"];
          staff_id?: string;
          start_time?: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_customer_fkey";
            columns: ["business_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "appointments_service_fkey";
            columns: ["business_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "appointments_staff_fkey";
            columns: ["business_id", "staff_id"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      business_members: {
        Row: {
          active: boolean;
          business_id: string;
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["business_member_role"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          business_id: string;
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["business_member_role"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          business_id?: string;
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["business_member_role"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "business_members_user_id_users_id_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      business_working_hours: {
        Row: {
          business_id: string;
          created_at: string;
          day_of_week: number;
          end_time: string | null;
          id: string;
          is_closed: boolean;
          start_time: string | null;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          day_of_week: number;
          end_time?: string | null;
          id?: string;
          is_closed?: boolean;
          start_time?: string | null;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          day_of_week?: number;
          end_time?: string | null;
          id?: string;
          is_closed?: boolean;
          start_time?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "business_working_hours_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      businesses: {
        Row: {
          active: boolean;
          address: string | null;
          booking_interval_minutes: number;
          cancellation_notice_minutes: number;
          created_at: string;
          currency: string;
          id: string;
          logo_url: string | null;
          maximum_advance_booking_days: number | null;
          minimum_booking_lead_minutes: number;
          name: string;
          onboarding_completed_at: string | null;
          phone: string | null;
          reschedule_notice_minutes: number;
          slug: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          address?: string | null;
          booking_interval_minutes?: number;
          cancellation_notice_minutes?: number;
          created_at?: string;
          currency: string;
          id?: string;
          logo_url?: string | null;
          maximum_advance_booking_days?: number | null;
          minimum_booking_lead_minutes?: number;
          name: string;
          onboarding_completed_at?: string | null;
          phone?: string | null;
          reschedule_notice_minutes?: number;
          slug: string;
          timezone: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          address?: string | null;
          booking_interval_minutes?: number;
          cancellation_notice_minutes?: number;
          created_at?: string;
          currency?: string;
          id?: string;
          logo_url?: string | null;
          maximum_advance_booking_days?: number | null;
          minimum_booking_lead_minutes?: number;
          name?: string;
          onboarding_completed_at?: string | null;
          phone?: string | null;
          reschedule_notice_minutes?: number;
          slug?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      customer_notes: {
        Row: {
          business_id: string;
          content: string;
          created_at: string;
          created_by_business_member_id: string;
          customer_id: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          content: string;
          created_at?: string;
          created_by_business_member_id: string;
          customer_id: string;
          id?: string;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          content?: string;
          created_at?: string;
          created_by_business_member_id?: string;
          customer_id?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customer_notes_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_notes_business_member_fkey";
            columns: ["business_id", "created_by_business_member_id"];
            isOneToOne: false;
            referencedRelation: "business_members";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "customer_notes_customer_fkey";
            columns: ["business_id", "customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      customers: {
        Row: {
          business_id: string;
          created_at: string;
          first_name: string;
          id: string;
          last_name: string | null;
          merged_at: string | null;
          merged_by_business_member_id: string | null;
          merged_into_customer_id: string | null;
          normalized_phone: string;
          notes: string | null;
          phone: string;
          phone_comparison_key: string;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          first_name: string;
          id?: string;
          last_name?: string | null;
          merged_at?: string | null;
          merged_by_business_member_id?: string | null;
          merged_into_customer_id?: string | null;
          normalized_phone: string;
          notes?: string | null;
          phone: string;
          phone_comparison_key: string;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          first_name?: string;
          id?: string;
          last_name?: string | null;
          merged_at?: string | null;
          merged_by_business_member_id?: string | null;
          merged_into_customer_id?: string | null;
          normalized_phone?: string;
          notes?: string | null;
          phone?: string;
          phone_comparison_key?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customers_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customers_merged_by_business_member_fkey";
            columns: ["business_id", "merged_by_business_member_id"];
            isOneToOne: false;
            referencedRelation: "business_members";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "customers_merged_into_customer_fkey";
            columns: ["business_id", "merged_into_customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      notification_outbox: {
        Row: {
          appointment_id: string;
          attempt_count: number;
          available_at: string;
          business_id: string;
          created_at: string;
          event_type: Database["public"]["Enums"]["appointment_notification_event_type"];
          id: string;
          idempotency_key: string;
          last_error_code: string | null;
          locked_at: string | null;
          locked_by: string | null;
          payload: NonNullable<Json>;
          payload_version: number;
          processed_at: string | null;
          status: Database["public"]["Enums"]["notification_outbox_status"];
          updated_at: string;
        };
        Insert: {
          appointment_id: string;
          attempt_count?: number;
          available_at?: string;
          business_id: string;
          created_at?: string;
          event_type: Database["public"]["Enums"]["appointment_notification_event_type"];
          id?: string;
          idempotency_key: string;
          last_error_code?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          payload: NonNullable<Json>;
          payload_version?: number;
          processed_at?: string | null;
          status?: Database["public"]["Enums"]["notification_outbox_status"];
          updated_at?: string;
        };
        Update: {
          appointment_id?: string;
          attempt_count?: number;
          available_at?: string;
          business_id?: string;
          created_at?: string;
          event_type?: Database["public"]["Enums"]["appointment_notification_event_type"];
          id?: string;
          idempotency_key?: string;
          last_error_code?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          payload?: NonNullable<Json>;
          payload_version?: number;
          processed_at?: string | null;
          status?: Database["public"]["Enums"]["notification_outbox_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_outbox_appointment_fkey";
            columns: ["business_id", "appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      platform_admin_audit_logs: {
        Row: {
          action: string;
          actor_user_id: string | null;
          created_at: string;
          id: string;
          metadata: Json | null;
          platform_admin_id: string | null;
          target_id: string | null;
          target_type: string;
        };
        Insert: {
          action: string;
          actor_user_id?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          platform_admin_id?: string | null;
          target_id?: string | null;
          target_type: string;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json | null;
          platform_admin_id?: string | null;
          target_id?: string | null;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_admin_audit_logs_actor_user_id_users_id_fk";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "platform_admin_audit_logs_platform_admin_id_platform_admins_id_";
            columns: ["platform_admin_id"];
            isOneToOne: false;
            referencedRelation: "platform_admins";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_admins: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["platform_admin_role"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["platform_admin_role"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["platform_admin_role"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_admins_user_id_users_id_fk";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      services: {
        Row: {
          active: boolean;
          business_id: string;
          created_at: string;
          description: string | null;
          duration_minutes: number;
          id: string;
          name: string;
          price: number;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          business_id: string;
          created_at?: string;
          description?: string | null;
          duration_minutes: number;
          id?: string;
          name: string;
          price: number;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          business_id?: string;
          created_at?: string;
          description?: string | null;
          duration_minutes?: number;
          id?: string;
          name?: string;
          price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "services_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      sessions: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          ip_address: string | null;
          token: string;
          updated_at: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          created_at: string;
          expires_at: string;
          id?: string;
          ip_address?: string | null;
          token: string;
          updated_at: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          ip_address?: string | null;
          token?: string;
          updated_at?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_users_id_fk";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      staff_profiles: {
        Row: {
          active: boolean;
          business_id: string;
          business_member_id: string;
          created_at: string;
          first_name: string;
          id: string;
          last_name: string;
          phone: string | null;
          profile_image_url: string | null;
          public_booking_enabled: boolean;
          updated_at: string;
          uses_business_hours: boolean;
        };
        Insert: {
          active?: boolean;
          business_id: string;
          business_member_id: string;
          created_at?: string;
          first_name: string;
          id?: string;
          last_name: string;
          phone?: string | null;
          profile_image_url?: string | null;
          public_booking_enabled?: boolean;
          updated_at?: string;
          uses_business_hours?: boolean;
        };
        Update: {
          active?: boolean;
          business_id?: string;
          business_member_id?: string;
          created_at?: string;
          first_name?: string;
          id?: string;
          last_name?: string;
          phone?: string | null;
          profile_image_url?: string | null;
          public_booking_enabled?: boolean;
          updated_at?: string;
          uses_business_hours?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "staff_profiles_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "staff_profiles_member_fkey";
            columns: ["business_id", "business_member_id"];
            isOneToOne: false;
            referencedRelation: "business_members";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      staff_services: {
        Row: {
          business_id: string;
          created_at: string;
          service_id: string;
          staff_id: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          service_id: string;
          staff_id: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          service_id?: string;
          staff_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_services_service_fkey";
            columns: ["business_id", "service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["business_id", "id"];
          },
          {
            foreignKeyName: "staff_services_staff_fkey";
            columns: ["business_id", "staff_id"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      staff_working_hours: {
        Row: {
          business_id: string;
          created_at: string;
          day_of_week: number;
          end_time: string | null;
          id: string;
          is_working: boolean;
          staff_id: string;
          start_time: string | null;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          day_of_week: number;
          end_time?: string | null;
          id?: string;
          is_working?: boolean;
          staff_id: string;
          start_time?: string | null;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          day_of_week?: number;
          end_time?: string | null;
          id?: string;
          is_working?: boolean;
          staff_id?: string;
          start_time?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_working_hours_staff_fkey";
            columns: ["business_id", "staff_id"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      time_blocks: {
        Row: {
          block_type: Database["public"]["Enums"]["time_block_type"];
          business_id: string;
          created_at: string;
          end_time: string;
          id: string;
          reason: string | null;
          staff_id: string | null;
          start_time: string;
          updated_at: string;
        };
        Insert: {
          block_type?: Database["public"]["Enums"]["time_block_type"];
          business_id: string;
          created_at?: string;
          end_time: string;
          id?: string;
          reason?: string | null;
          staff_id?: string | null;
          start_time: string;
          updated_at?: string;
        };
        Update: {
          block_type?: Database["public"]["Enums"]["time_block_type"];
          business_id?: string;
          created_at?: string;
          end_time?: string;
          id?: string;
          reason?: string | null;
          staff_id?: string | null;
          start_time?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "time_blocks_business_id_businesses_id_fk";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_blocks_staff_fkey";
            columns: ["business_id", "staff_id"];
            isOneToOne: false;
            referencedRelation: "staff_profiles";
            referencedColumns: ["business_id", "id"];
          },
        ];
      };
      users: {
        Row: {
          created_at: string;
          email: string;
          email_verified: boolean;
          force_password_change: boolean;
          id: string;
          image: string | null;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          email_verified: boolean;
          force_password_change?: boolean;
          id?: string;
          image?: string | null;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          email_verified?: boolean;
          force_password_change?: boolean;
          id?: string;
          image?: string | null;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      verifications: {
        Row: {
          created_at: string | null;
          expires_at: string;
          id: string;
          identifier: string;
          updated_at: string | null;
          value: string;
        };
        Insert: {
          created_at?: string | null;
          expires_at: string;
          id?: string;
          identifier: string;
          updated_at?: string | null;
          value: string;
        };
        Update: {
          created_at?: string | null;
          expires_at?: string;
          id?: string;
          identifier?: string;
          updated_at?: string | null;
          value?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      customer_phone_comparison_key: { Args: { phone_value: string }; Returns: string };
      is_valid_timezone: { Args: { tz: string }; Returns: boolean };
    };
    Enums: {
      appointment_notification_event_type:
        | "APPOINTMENT_CREATED"
        | "APPOINTMENT_RESCHEDULED"
        | "APPOINTMENT_CANCELLED";
      appointment_source: "PUBLIC_WEB" | "MANUAL_ADMIN" | "MANUAL_STAFF";
      appointment_status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
      business_member_role: "OWNER" | "ADMIN" | "STAFF";
      notification_outbox_status: "PENDING" | "PROCESSING" | "PROCESSED" | "FAILED";
      platform_admin_role: "SUPER_ADMIN" | "ADMIN";
      time_block_type: "TIME_OFF" | "BREAK" | "BLOCKED";
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
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
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
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
  public: {
    Enums: {
      appointment_notification_event_type: [
        "APPOINTMENT_CREATED",
        "APPOINTMENT_RESCHEDULED",
        "APPOINTMENT_CANCELLED",
      ],
      appointment_source: ["PUBLIC_WEB", "MANUAL_ADMIN", "MANUAL_STAFF"],
      appointment_status: ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"],
      business_member_role: ["OWNER", "ADMIN", "STAFF"],
      notification_outbox_status: ["PENDING", "PROCESSING", "PROCESSED", "FAILED"],
      platform_admin_role: ["SUPER_ADMIN", "ADMIN"],
      time_block_type: ["TIME_OFF", "BREAK", "BLOCKED"],
    },
  },
} as const;
