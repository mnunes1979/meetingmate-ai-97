// Meeting and AI analysis type definitions

export interface Participant {
  name: string;
  role?: string;
}

export interface SalesOpportunity {
  title: string;
  description: string;
  product_service?: string;
  estimated_value: 'low' | 'medium' | 'high';
  urgency?: 'low' | 'medium' | 'high';
  probability: 'low' | 'medium' | 'high';
  trigger?: string;
  recommended_action?: string;
}

export interface ClientNeed {
  need: string;
  importance: 'low' | 'medium' | 'high';
  solution?: string;
}

export interface Objection {
  objection: string;
  type: 'price' | 'timing' | 'technical' | 'trust' | 'other';
  severity: 'low' | 'medium' | 'high';
  response?: string;
}

export interface Risk {
  description: string;
  severity: 'low' | 'medium' | 'high';
  mitigation?: string;
}

export interface Intent {
  intent: string;
  confidence: 'low' | 'medium' | 'high';
}

export interface BusinessInsights {
  overall_interest: 'low' | 'medium' | 'high';
  decision_stage: 'awareness' | 'consideration' | 'decision' | 'closed';
  budget_indicators?: string;
  timeline_indicators?: string;
  competition_mentions?: string;
  key_influencers?: string;
}

export interface MeetingSummary {
  overview: string;
  topics_discussed?: string[];
  key_points?: string[];
  strengths?: string[];
  weaknesses?: string[];
  action_items?: string[];
}

export interface EmailDraft {
  audience: 'client' | 'finance' | 'tech' | 'sales' | 'support' | 'management' | 'custom' | 'internal';
  subject: string;
  body_md: string;
  suggested_recipients?: string[];
  context?: string;
}

export interface ActionItem {
  task?: string;
  title?: string;
  assignee?: string;
  priority?: 'High' | 'Medium' | 'Low';
  due_date?: string;
}

export interface ProcessedMeeting {
  language: string;
  summary: MeetingSummary | string;
  sentiment: 'positive' | 'neutral' | 'negative';
  sentiment_score?: number;
  sentiment_confidence?: number;
  customer?: { name?: string; company?: string };
  participants: Participant[];
  meeting?: { datetime_iso?: string; duration_min?: number };
  intents: Intent[];
  email_drafts: EmailDraft[];
  risks: Risk[];
  sales_opportunities?: SalesOpportunity[];
  client_needs?: ClientNeed[];
  objections?: Objection[];
  business_insights?: BusinessInsights;
  action_items?: ActionItem[];
  topics?: string[];
  opportunities?: SalesOpportunity[];
}

export interface MeetingData {
  id: string;
  created_at: string;
  meeting_datetime: string | null;
  meeting_duration_min: number | null;
  sales_rep_name: string | null;
  customer_name: string | null;
  customer_company: string | null;
  language: string;
  sentiment: string;
  sentiment_score?: number | null;
  sentiment_confidence: number | null;
  participants: Participant[] | null;
  raw_llm_output: ProcessedMeeting | null;
  transcript_text: string;
  action_items: ActionItem[] | null;
  user_id: string;
}

// Recharts tooltip types
export interface TooltipPayloadItem<TData = Record<string, unknown>, TValue = number> {
  value: TValue;
  payload: TData;
  name?: string;
  dataKey?: string;
}

export interface RechartsTooltipProps<TData = Record<string, unknown>, TValue = number> {
  active?: boolean;
  payload?: TooltipPayloadItem<TData, TValue>[];
  label?: string;
}

// Error handling types
export interface AppError extends Error {
  code?: string;
  status?: number;
  stack?: string;
}

// User profile types
export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  access_type: 'full' | 'renewals_only';
  avatar_url?: string | null;
  active: boolean;
}

// Session types  
export interface AuthSession {
  user: {
    id: string;
    email?: string;
  };
  access_token: string;
}
