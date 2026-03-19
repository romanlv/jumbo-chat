export interface AdminSession {
  id: string;
  status: string;
  escalatedReason: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage: string | null;
  lastMessageRole: string | null;
}

export interface AdminMessage {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  sources: string | null;
  toolCalls: string | null;
  createdAt: string;
}

export interface SessionDetail {
  id: string;
  status: string;
  escalatedReason: string | null;
  createdAt: string;
  updatedAt: string;
  messages: AdminMessage[];
}
