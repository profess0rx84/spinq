export type Session = {
  id: string;
  dj_id: string;
  venue_slug: string;
  venue_name: string;
  is_live: boolean;
  order_mode: "auto" | "manual";
  chime_enabled: boolean;
  now_title: string | null;
  now_artist: string | null;
  now_art_url: string | null;
  req_total: number;
  started_at: string;
  ended_at: string | null;
};

export type SessionTips = {
  session_id: string;
  venmo: number;
  cashapp: number;
};

export type QueueItem = {
  id: string;
  session_id: string;
  title: string;
  artist: string;
  votes: number;
  boosted: boolean;
  note: string;
  requested_by: string[];
  position: number;
  created_at: string;
};

export type Vote = {
  session_id: string;
  queue_item_id: string;
  guest_id: string;
  created_at: string;
};

export type IncomingRequest = {
  id: string;
  session_id: string;
  title: string;
  artist: string;
  art_url: string | null;
  requester_name: string;
  tip: number;
  pay_method: string;
  note: string;
  note_approved: boolean;
  merged_count: number;
  created_at: string;
};

export type PlayedItem = {
  id: string;
  session_id: string;
  title: string;
  artist: string;
  played_at: string;
};

export type Notification = {
  id: string;
  session_id: string;
  guest_id: string;
  message: string;
  created_at: string;
  read: boolean;
};

export type DjProfile = {
  id: string;
  email: string;
  venue_slug: string;
  venmo_handle: string | null;
  cashapp_handle: string | null;
  created_at: string;
};

export type SessionHistoryRow = {
  id: string;
  venue_name: string;
  started_at: string;
  ended_at: string | null;
  requests: number;
  played_count: number;
  venmo: number;
  cashapp: number;
  songs: string;
};

type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      dj_profiles: Table<DjProfile>;
      sessions: Table<Session>;
      session_tips: Table<SessionTips>;
      queue_items: Table<QueueItem>;
      votes: Table<Vote>;
      incoming_requests: Table<IncomingRequest>;
      played_items: Table<PlayedItem>;
      notifications: Table<Notification>;
    };
    Views: Record<string, never>;
    Functions: {
      get_open_session: { Args: { p_venue_slug: string }; Returns: Session };
      get_session_public_stats: { Args: { p_session_id: string }; Returns: { req_total: number; voters: number }[] };
      get_session_history: { Args: { p_dj_id: string }; Returns: SessionHistoryRow[] };
      get_payment_handles: {
        Args: { p_venue_slug: string };
        Returns: { venmo_handle: string | null; cashapp_handle: string | null }[];
      };
      delete_session: { Args: { p_session_id: string }; Returns: void };
      submit_request: {
        Args: {
          p_session_id: string; p_title: string; p_artist: string; p_art_url: string | null;
          p_guest_id: string; p_requester_name: string; p_tip: number; p_pay_method: string; p_note: string;
        };
        Returns: "queued_vote" | "merged_pending" | "created";
      };
      toggle_vote: { Args: { p_session_id: string; p_queue_item_id: string; p_guest_id: string }; Returns: boolean };
      accept_request: { Args: { p_request_id: string }; Returns: string };
      decline_request: { Args: { p_request_id: string }; Returns: void };
      toggle_note_approval: { Args: { p_request_id: string }; Returns: boolean };
      play_next: { Args: { p_session_id: string; p_queue_item_id: string }; Returns: void };
      remove_queue_item: { Args: { p_queue_item_id: string }; Returns: void };
      clear_now_playing: { Args: { p_session_id: string }; Returns: void };
      reorder_queue: { Args: { p_session_id: string; p_queue_item_id: string; p_direction: "up" | "down" }; Returns: void };
      autosort_queue: { Args: { p_session_id: string }; Returns: void };
      set_live: { Args: { p_session_id: string; p_live: boolean }; Returns: void };
      set_venue_name: { Args: { p_session_id: string; p_venue_name: string }; Returns: void };
      set_chime: { Args: { p_session_id: string; p_enabled: boolean }; Returns: void };
      end_session: { Args: { p_session_id: string }; Returns: string };
      start_first_session: { Args: { p_venue_slug: string; p_venue_name: string }; Returns: string };
    };
  };
};
