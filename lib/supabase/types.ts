export type TaskStatus =
  | 'draft'
  | 'pending_payment'
  | 'pending_dispatch'
  | 'broadcasting'
  | 'assigned'
  | 'in_progress'
  | 'awaiting_review'
  | 'completed'
  | 'disputed'
  | 'expired_unfilled'
  | 'cancelled';

export type AddressStatus = 'pending' | 'resolved' | 'failed';
export type BudgetType = 'fixed' | 'negotiable';

export type ProfileRole = 'customer' | 'worker' | 'admin';
export type ProfileStatus = 'active' | 'suspended' | 'banned';

export type VerificationStatus =
  | 'unverified'
  | 'provisional'
  | 'verified'
  | 'rejected';

export type AssignmentStatus =
  | 'assigned'
  | 'en_route'
  | 'in_progress'
  | 'submitted'
  | 'completed'
  | 'abandoned';

export type EscrowStatus =
  | 'locked'
  | 'released'
  | 'refunded'
  | 'partial_refund'
  | 'split';

export type PayoutStatus =
  | 'payout_pending'
  | 'payout_processing'
  | 'payout_success'
  | 'payout_failed';

export type DisputeStatus =
  | 'open'
  | 'evidence_phase'
  | 'admin_review'
  | 'resolved'
  | 'auto_closed';

export type MessageType =
  | 'text'
  | 'photo'
  | 'video'
  | 'audio'
  | 'system'
  | 'pin_request'
  | 'flag';

export type EfrisStatus = 'pending' | 'processing' | 'sent' | 'failed';
export type WebhookSource = 'whatsapp' | 'ussd' | 'payments' | 'other';
export type WebhookStatus = 'pending' | 'processing' | 'processed' | 'failed';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          phone: string;
          full_name: string;
          role: ProfileRole;
          status: ProfileStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          phone: string;
          full_name: string;
          role?: ProfileRole;
          status?: ProfileStatus;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      worker_profiles: {
        Row: {
          id: string;
          user_id: string;
          skills: string[];
          reliability_score: number;
          verification_status: VerificationStatus;
          nin: string | null;
          nin_name: string | null;
          id_image_path: string | null;
          name_match_score: number | null;
          completed_tasks: number;
          top_rated_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          skills?: string[];
          verification_status?: VerificationStatus;
          nin?: string;
          nin_name?: string;
          id_image_path?: string;
        };
        Update: Partial<Database['public']['Tables']['worker_profiles']['Insert']>;
      };
      safety_wallets: {
        Row: {
          id: string;
          worker_id: string;
          balance: number;
          held_amount: number;
          negative_ledger: number;
          tasks_contributed: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['safety_wallets']['Row']>;
        Update: Partial<Database['public']['Tables']['safety_wallets']['Row']>;
      };
      tasks: {
        Row: {
          id: string;
          customer_id: string;
          description: string;
          required_skills: string[];
          neighborhood: string | null;
          district: string | null;
          lat: number | null;
          lng: number | null;
          exact_address: string | null;
          address_status: AddressStatus;
          budget: number;
          platform_fee: number;
          tax_fee: number;
          total_amount: number;
          budget_type: BudgetType;
          timeframe: string | null;
          capacity: number;
          status: TaskStatus;
          version: number;
          state_seq: number;
          dispatch_cycle: number;
          broadcast_at: string | null;
          assigned_at: string | null;
          en_route_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          customer_id: string;
          description: string;
          required_skills?: string[];
          neighborhood?: string;
          district?: string;
          lat?: number;
          lng?: number;
          budget: number;
          platform_fee?: number;
          tax_fee?: number;
          total_amount?: number;
          budget_type?: BudgetType;
          timeframe?: string;
          capacity?: number;
          status?: TaskStatus;
        };
        Update: Partial<Database['public']['Tables']['tasks']['Insert']>;
      };
      task_attributes: {
        Row: {
          id: string;
          task_id: string;
          attr_key: string;
          attr_value: string;
          created_at: string;
        };
        Insert: { task_id: string; attr_key: string; attr_value: string };
        Update: Partial<Database['public']['Tables']['task_attributes']['Insert']>;
      };
      task_assignments: {
        Row: {
          id: string;
          task_id: string;
          worker_id: string;
          pin_code: string;
          status: AssignmentStatus;
          assigned_at: string;
          en_route_at: string | null;
          submitted_at: string | null;
          completed_at: string | null;
          auto_release_at: string | null;
        };
        Insert: {
          task_id: string;
          worker_id: string;
          pin_code: string;
          status?: AssignmentStatus;
        };
        Update: Partial<Database['public']['Tables']['task_assignments']['Insert']>;
      };
      escrow_holds: {
        Row: {
          id: string;
          task_id: string;
          assignment_id: string | null;
          customer_id: string;
          worker_id: string | null;
          amount: number;
          status: EscrowStatus;
          gateway_ref: string | null;
          created_at: string;
          released_at: string | null;
        };
        Insert: Partial<Database['public']['Tables']['escrow_holds']['Row']>;
        Update: Partial<Database['public']['Tables']['escrow_holds']['Row']>;
      };
      payouts: {
        Row: {
          id: string;
          task_id: string;
          worker_id: string;
          amount: number;
          phone: string;
          idempotency_key: string;
          status: PayoutStatus;
          retry_count: number;
          linked_key: string | null;
          gateway_ref: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['payouts']['Row']>;
        Update: Partial<Database['public']['Tables']['payouts']['Row']>;
      };
      chat_rooms: {
        Row: {
          id: string;
          task_id: string;
          customer_id: string;
          worker_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['chat_rooms']['Row']>;
        Update: Partial<Database['public']['Tables']['chat_rooms']['Row']>;
      };
      chat_messages: {
        Row: {
          id: string;
          room_id: string;
          sender_id: string;
          body: string | null;
          message_type: MessageType;
          media_path: string | null;
          created_at: string;
        };
        Insert: {
          room_id: string;
          sender_id: string;
          body?: string;
          message_type?: MessageType;
          media_path?: string;
        };
        Update: Partial<Database['public']['Tables']['chat_messages']['Insert']>;
      };
      message_receipts: {
        Row: {
          id: string;
          message_id: string;
          room_id: string;
          reader_id: string;
          receipt_type: 'delivered' | 'read';
          created_at: string;
        };
        Insert: {
          message_id: string;
          room_id: string;
          reader_id: string;
          receipt_type: 'delivered' | 'read';
          created_at?: string;
        };
        Update: {
          receipt_type?: 'delivered' | 'read';
        };
      };
      disputes: {
        Row: {
          id: string;
          task_id: string;
          raised_by: string;
          reason: string;
          status: DisputeStatus;
          step: number;
          resolution: string | null;
          refund_amount: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          task_id: string;
          raised_by: string;
          reason: string;
          status?: DisputeStatus;
          step?: number;
        };
        Update: Partial<Database['public']['Tables']['disputes']['Insert']>;
      };
      evidence_files: {
        Row: {
          id: string;
          dispute_id: string | null;
          task_id: string;
          uploaded_by: string;
          file_path: string;
          file_type: string;
          mime_type: string | null;
          geofence_lat: number | null;
          geofence_lng: number | null;
          geofence_accuracy: number | null;
          client_timestamp: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['evidence_files']['Row']>;
        Update: Partial<Database['public']['Tables']['evidence_files']['Row']>;
      };
      efris_outbox: {
        Row: {
          id: string;
          task_id: string;
          payload: Record<string, unknown>;
          status: EfrisStatus;
          retry_count: number;
          next_attempt_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          task_id: string;
          payload: Record<string, unknown>;
          status?: EfrisStatus;
          next_attempt_at?: string;
        };
        Update: {
          status?: EfrisStatus;
          retry_count?: number;
          next_attempt_at?: string;
        };
      };
      outbox_dlq: {
        Row: {
          id: string;
          outbox_id: string;
          task_id: string | null;
          payload: Record<string, unknown>;
          failure_reason: string | null;
          failed_attempts: number;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['outbox_dlq']['Row']>;
        Update: Partial<Database['public']['Tables']['outbox_dlq']['Row']>;
      };
      webhook_inbox: {
        Row: {
          id: string;
          source: WebhookSource;
          payload: Record<string, unknown>;
          signature: string | null;
          signature_timestamp: string | null;
          status: WebhookStatus;
          processed_at: string | null;
          created_at: string;
        };
        Insert: {
          source: WebhookSource;
          payload: Record<string, unknown>;
          signature?: string | null;
          signature_timestamp?: string | null;
          status?: WebhookStatus;
          created_at?: string;
        };
        Update: {
          status?: WebhookStatus;
          processed_at?: string | null;
        };
      };
    };
    Functions: {
      claim_task: {
        Args: { p_task_id: string; p_worker_id: string; p_pin: string };
        Returns: unknown;
      };
      generate_pin: {
        Args: { p_task_id: string; p_worker_id: string };
        Returns: string;
      };
    };
  };
}
