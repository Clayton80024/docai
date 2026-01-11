export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      applications: {
        Row: {
          id: string;
          user_id: string;
          country: string;
          visa_type: string;
          case_id: string | null;
          status: "draft" | "in_progress" | "completed" | "submitted";
          form_data: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          country: string;
          visa_type: string;
          case_id?: string | null;
          status?: "draft" | "in_progress" | "completed" | "submitted";
          form_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          country?: string;
          visa_type?: string;
          case_id?: string | null;
          status?: "draft" | "in_progress" | "completed" | "submitted";
          form_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      documents: {
        Row: {
          id: string;
          application_id: string | null;
          user_id: string;
          name: string;
          type: string;
          file_url: string;
          file_size: number;
          mime_type: string;
          status: "pending" | "processing" | "completed" | "error";
          extracted_data: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_id?: string | null;
          user_id: string;
          name: string;
          type: string;
          file_url: string;
          file_size: number;
          mime_type: string;
          status?: "pending" | "processing" | "completed" | "error";
          extracted_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string | null;
          user_id?: string;
          name?: string;
          type?: string;
          file_url?: string;
          file_size?: number;
          mime_type?: string;
          status?: "pending" | "processing" | "completed" | "error";
          extracted_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          user_id: string;
          email: string | null;
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
          date_of_birth: string | null;
          nationality: string | null;
          address: string | null;
          city: string | null;
          state: string | null;
          country: string | null;
          postal_code: string | null;
          avatar_url: string | null;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          date_of_birth?: string | null;
          nationality?: string | null;
          address?: string | null;
          city?: string | null;
          state?: string | null;
          country?: string | null;
          postal_code?: string | null;
          avatar_url?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          email?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          date_of_birth?: string | null;
          nationality?: string | null;
          address?: string | null;
          city?: string | null;
          state?: string | null;
          country?: string | null;
          postal_code?: string | null;
          avatar_url?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      generated_documents: {
        Row: {
          id: string;
          application_id: string | null;
          user_id: string;
          document_type: "cover_letter" | "personal_statement" | "program_justification" | "ties_to_country" | "sponsor_letter" | "exhibit_list";
          content: string;
          version: number;
          is_current: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_id?: string | null;
          user_id: string;
          document_type: "cover_letter" | "personal_statement" | "program_justification" | "ties_to_country" | "sponsor_letter" | "exhibit_list";
          content: string;
          version?: number;
          is_current?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string | null;
          user_id?: string;
          document_type?: "cover_letter" | "personal_statement" | "program_justification" | "ties_to_country" | "sponsor_letter" | "exhibit_list";
          content?: string;
          version?: number;
          is_current?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      application_status: "draft" | "in_progress" | "completed" | "submitted";
      document_status: "pending" | "processing" | "completed" | "error";
    };
  };
}

