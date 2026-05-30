export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      onboarding_fields: {
        Row: {
          created_at: string
          field_key: string
          id: string
          label: string
          options: Json | null
          position: number
          type: Database["public"]["Enums"]["onboarding_field_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_key: string
          id?: string
          label: string
          options?: Json | null
          position?: number
          type: Database["public"]["Enums"]["onboarding_field_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_key?: string
          id?: string
          label?: string
          options?: Json | null
          position?: number
          type?: Database["public"]["Enums"]["onboarding_field_type"]
          updated_at?: string
        }
        Relationships: []
      }
      onboarding_responses: {
        Row: {
          answered_at: string
          field_id: string
          id: string
          user_id: string
          value: Json
        }
        Insert: {
          answered_at?: string
          field_id: string
          id?: string
          user_id: string
          value: Json
        }
        Update: {
          answered_at?: string
          field_id?: string
          id?: string
          user_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_responses_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "onboarding_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      studies: {
        Row: {
          authored_data: Json
          id: string
          name: string
          slug: string
          updated_at: string
          visibility: Database["public"]["Enums"]["project_visibility"]
        }
        Insert: {
          authored_data?: Json
          id?: string
          name: string
          slug: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["project_visibility"]
        }
        Update: {
          authored_data?: Json
          id?: string
          name?: string
          slug?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["project_visibility"]
        }
        Relationships: []
      }
      study_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          module_id: string
          payload: Json
          study_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          module_id: string
          payload?: Json
          study_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          module_id?: string
          payload?: Json
          study_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_events_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      study_responses: {
        Row: {
          id: string
          section_key: string
          study_id: string
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          id?: string
          section_key: string
          study_id: string
          updated_at?: string
          user_id: string
          value?: string
        }
        Update: {
          id?: string
          section_key?: string
          study_id?: string
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_responses_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          first_name: string
          has_onboarded: boolean
          id: string
          pid: string
        }
        Insert: {
          created_at?: string
          email: string
          first_name: string
          has_onboarded?: boolean
          id?: string
          pid: string
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string
          has_onboarded?: boolean
          id?: string
          pid?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: { [_ in never]: never }
    Enums: {
      onboarding_field_type:
        | "short_text"
        | "long_text"
        | "select"
        | "multi_select"
        | "number"
      project_visibility: "shown" | "hidden" | "archived"
    }
    CompositeTypes: { [_ in never]: never }
  }
}
