// GENERATED FILE - DO NOT EDIT BY HAND.
// Source of truth: supabase/migrations. Regenerate with `pnpm db:types`.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      appointments: {
        Row: {
          business_id: string;
          created_at: string;
          created_by: string | null;
          customer_id: string;
          customer_note: string | null;
          end_at: string;
          id: string;
          internal_note: string | null;
          service_currency_snapshot: string;
          service_duration_snapshot: number;
          service_id: string;
          service_name_snapshot: string;
          service_price_snapshot: number;
          source: Database["public"]["Enums"]["appointment_source"];
          staff_id: string;
          start_at: string;
          status: Database["public"]["Enums"]["appointment_status"];
          updated_at: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          created_by?: string | null;
          customer_id: string;
          customer_note?: string | null;
          end_at: string;
          id?: string;
          internal_note?: string | null;
          service_currency_snapshot: string;
          service_duration_snapshot: number;
          service_id: string;
          service_name_snapshot: string;
          service_price_snapshot: number;
          source: Database["public"]["Enums"]["appointment_source"];
          staff_id: string;
          start_at: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          created_by?: string | null;
          customer_id?: string;
          customer_note?: string | null;
          end_at?: string;
          id?: string;
          internal_note?: string | null;
          service_currency_snapshot?: string;
          service_duration_snapshot?: number;
          service_id?: string;
          service_name_snapshot?: string;
          service_price_snapshot?: number;
          source?: Database["public"]["Enums"]["appointment_source"];
          staff_id?: string;
          start_at?: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_business_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
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
            foreignKeyName: "business_members_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
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
            foreignKeyName: "business_working_hours_business_id_fkey";
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
          created_at: string;
          currency: string;
          id: string;
          logo_url: string | null;
          name: string;
          phone: string | null;
          slug: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          address?: string | null;
          booking_interval_minutes?: number;
          created_at?: string;
          currency: string;
          id?: string;
          logo_url?: string | null;
          name: string;
          phone?: string | null;
          slug: string;
          timezone: string;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          address?: string | null;
          booking_interval_minutes?: number;
          created_at?: string;
          currency?: string;
          id?: string;
          logo_url?: string | null;
          name?: string;
          phone?: string | null;
          slug?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          business_id: string;
          created_at: string;
          first_name: string;
          id: string;
          last_name: string | null;
          normalized_phone: string;
          notes: string | null;
          phone: string;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          first_name: string;
          id?: string;
          last_name?: string | null;
          normalized_phone: string;
          notes?: string | null;
          phone: string;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          first_name?: string;
          id?: string;
          last_name?: string | null;
          normalized_phone?: string;
          notes?: string | null;
          phone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
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
            foreignKeyName: "services_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
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
            foreignKeyName: "staff_profiles_business_fkey";
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
          is_closed: boolean;
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
          is_closed?: boolean;
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
          is_closed?: boolean;
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
          business_id: string;
          created_at: string;
          created_by: string | null;
          end_at: string;
          id: string;
          reason: string | null;
          staff_id: string | null;
          start_at: string;
          type: Database["public"]["Enums"]["time_block_type"];
          updated_at: string;
        };
        Insert: {
          business_id: string;
          created_at?: string;
          created_by?: string | null;
          end_at: string;
          id?: string;
          reason?: string | null;
          staff_id?: string | null;
          start_at: string;
          type: Database["public"]["Enums"]["time_block_type"];
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          created_by?: string | null;
          end_at?: string;
          id?: string;
          reason?: string | null;
          staff_id?: string | null;
          start_at?: string;
          type?: Database["public"]["Enums"]["time_block_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "time_blocks_business_fkey";
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      appointment_source: "PUBLIC_BOOKING" | "ADMIN" | "STAFF";
      appointment_status: "BOOKED" | "COMPLETED" | "CANCELLED";
      business_member_role: "OWNER" | "ADMIN" | "STAFF";
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
      appointment_source: ["PUBLIC_BOOKING", "ADMIN", "STAFF"],
      appointment_status: ["BOOKED", "COMPLETED", "CANCELLED"],
      business_member_role: ["OWNER", "ADMIN", "STAFF"],
      time_block_type: ["TIME_OFF", "BREAK", "BLOCKED"],
    },
  },
} as const;
