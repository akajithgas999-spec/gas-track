export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      customer_deposits: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          cylinder_id: string | null
          id: string
          notes: string | null
          occurred_at: string
          type: Database["public"]["Enums"]["deposit_txn_type"]
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id: string
          cylinder_id?: string | null
          id?: string
          notes?: string | null
          occurred_at?: string
          type: Database["public"]["Enums"]["deposit_txn_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          cylinder_id?: string | null
          id?: string
          notes?: string | null
          occurred_at?: string
          type?: Database["public"]["Enums"]["deposit_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "customer_deposits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          customer_number: string | null
          deposit_balance: number
          email: string | null
          gst_number: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          customer_number?: string | null
          deposit_balance?: number
          email?: string | null
          gst_number?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          customer_number?: string | null
          deposit_balance?: number
          email?: string | null
          gst_number?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cylinder_types: {
        Row: {
          code: string
          created_at: string
          deposit: number
          description: string | null
          hsn_code: string | null
          id: string
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          deposit?: number
          description?: string | null
          hsn_code?: string | null
          id?: string
          name: string
          price?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          deposit?: number
          description?: string | null
          hsn_code?: string | null
          id?: string
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      cylinders: {
        Row: {
          created_at: string
          current_customer_id: string | null
          id: string
          issued_at: string | null
          notes: string | null
          serial_number: string
          status: Database["public"]["Enums"]["cylinder_status"]
          type_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_customer_id?: string | null
          id?: string
          issued_at?: string | null
          notes?: string | null
          serial_number: string
          status?: Database["public"]["Enums"]["cylinder_status"]
          type_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_customer_id?: string | null
          id?: string
          issued_at?: string | null
          notes?: string | null
          serial_number?: string
          status?: Database["public"]["Enums"]["cylinder_status"]
          type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cylinders_current_customer_id_fkey"
            columns: ["current_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cylinders_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "cylinder_types"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          cgst_amount: number
          created_at: string
          cylinder_id: string | null
          description: string | null
          hsn_code: string | null
          id: string
          invoice_id: string
          quantity: number
          rate: number
          sgst_amount: number
          taxable: number
          total: number
          type_id: string | null
        }
        Insert: {
          cgst_amount?: number
          created_at?: string
          cylinder_id?: string | null
          description?: string | null
          hsn_code?: string | null
          id?: string
          invoice_id: string
          quantity?: number
          rate?: number
          sgst_amount?: number
          taxable?: number
          total?: number
          type_id?: string | null
        }
        Update: {
          cgst_amount?: number
          created_at?: string
          cylinder_id?: string | null
          description?: string | null
          hsn_code?: string | null
          id?: string
          invoice_id?: string
          quantity?: number
          rate?: number
          sgst_amount?: number
          taxable?: number
          total?: number
          type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          billing_date: string
          cgst_amount: number
          cgst_rate: number
          created_at: string
          customer_id: string
          cylinder_ids: string[]
          deposit_amount: number
          discount: number
          gst_number: string | null
          hsn_code: string | null
          id: string
          invoice_number: string
          issued_at: string
          notes: string | null
          paid_at: string | null
          return_date: string | null
          roundoff: number
          sgst_amount: number
          sgst_rate: number
          status: Database["public"]["Enums"]["payment_status"]
          taxable_amount: number
          total: number
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          billing_date?: string
          cgst_amount?: number
          cgst_rate?: number
          created_at?: string
          customer_id: string
          cylinder_ids?: string[]
          deposit_amount?: number
          discount?: number
          gst_number?: string | null
          hsn_code?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string
          notes?: string | null
          paid_at?: string | null
          return_date?: string | null
          roundoff?: number
          sgst_amount?: number
          sgst_rate?: number
          status?: Database["public"]["Enums"]["payment_status"]
          taxable_amount?: number
          total?: number
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_date?: string
          cgst_amount?: number
          cgst_rate?: number
          created_at?: string
          customer_id?: string
          cylinder_ids?: string[]
          deposit_amount?: number
          discount?: number
          gst_number?: string | null
          hsn_code?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string
          notes?: string | null
          paid_at?: string | null
          return_date?: string | null
          roundoff?: number
          sgst_amount?: number
          sgst_rate?: number
          status?: Database["public"]["Enums"]["payment_status"]
          taxable_amount?: number
          total?: number
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_items: {
        Row: {
          cgst_amount: number
          created_at: string
          cylinder_id: string | null
          hsn_code: string | null
          id: string
          purchase_id: string
          quantity: number
          rate: number
          serial_number: string | null
          sgst_amount: number
          taxable: number
          total: number
          type_id: string | null
        }
        Insert: {
          cgst_amount?: number
          created_at?: string
          cylinder_id?: string | null
          hsn_code?: string | null
          id?: string
          purchase_id: string
          quantity?: number
          rate?: number
          serial_number?: string | null
          sgst_amount?: number
          taxable?: number
          total?: number
          type_id?: string | null
        }
        Update: {
          cgst_amount?: number
          created_at?: string
          cylinder_id?: string | null
          hsn_code?: string | null
          id?: string
          purchase_id?: string
          quantity?: number
          rate?: number
          serial_number?: string | null
          sgst_amount?: number
          taxable?: number
          total?: number
          type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          bill_date: string
          bill_number: string | null
          cgst_amount: number
          cgst_rate: number
          challan_date: string | null
          challan_number: string | null
          created_at: string
          discount: number
          gst_number: string | null
          id: string
          notes: string | null
          purchase_number: string
          roundoff: number
          sgst_amount: number
          sgst_rate: number
          supplier_id: string | null
          taxable_amount: number
          total: number
          updated_at: string
        }
        Insert: {
          bill_date?: string
          bill_number?: string | null
          cgst_amount?: number
          cgst_rate?: number
          challan_date?: string | null
          challan_number?: string | null
          created_at?: string
          discount?: number
          gst_number?: string | null
          id?: string
          notes?: string | null
          purchase_number?: string
          roundoff?: number
          sgst_amount?: number
          sgst_rate?: number
          supplier_id?: string | null
          taxable_amount?: number
          total?: number
          updated_at?: string
        }
        Update: {
          bill_date?: string
          bill_number?: string | null
          cgst_amount?: number
          cgst_rate?: number
          challan_date?: string | null
          challan_number?: string | null
          created_at?: string
          discount?: number
          gst_number?: string | null
          id?: string
          notes?: string | null
          purchase_number?: string
          roundoff?: number
          sgst_amount?: number
          sgst_rate?: number
          supplier_id?: string | null
          taxable_amount?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          gst_number: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          customer_id: string | null
          cylinder_id: string
          id: string
          notes: string | null
          occurred_at: string
          txn_type: Database["public"]["Enums"]["txn_type"]
          type_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          customer_id?: string | null
          cylinder_id: string
          id?: string
          notes?: string | null
          occurred_at?: string
          txn_type: Database["public"]["Enums"]["txn_type"]
          type_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string | null
          cylinder_id?: string
          id?: string
          notes?: string | null
          occurred_at?: string
          txn_type?: Database["public"]["Enums"]["txn_type"]
          type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_cylinder_id_fkey"
            columns: ["cylinder_id"]
            isOneToOne: false
            referencedRelation: "cylinders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "cylinder_types"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "staff"
      cylinder_status: "in_stock" | "issued" | "maintenance" | "retired"
      deposit_txn_type: "collected" | "refunded" | "adjusted"
      payment_status: "paid" | "pending" | "cancelled"
      txn_type: "issue" | "return" | "incoming"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "staff"],
      cylinder_status: ["in_stock", "issued", "maintenance", "retired"],
      deposit_txn_type: ["collected", "refunded", "adjusted"],
      payment_status: ["paid", "pending", "cancelled"],
      txn_type: ["issue", "return", "incoming"],
    },
  },
} as const
