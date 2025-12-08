export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
}

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: "conv_1",
    title: "Chat App Architecture",
    updatedAt: Date.now() - 1000 * 60 * 30, // 30 mins ago
    messages: [
      { id: "msg_1", role: "user", content: "Design a scalable architecture for a real-time chat app using WebSockets and Redis.", timestamp: Date.now() - 1000 * 60 * 35 },
      { id: "msg_2", role: "assistant", content: "Here is a scalable architecture design...", timestamp: Date.now() - 1000 * 60 * 30 }
    ]
  },
  {
    id: "conv_2",
    title: "React Performance Optimization",
    updatedAt: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
    messages: [
      { id: "msg_3", role: "user", content: "How can I optimize large lists in React?", timestamp: Date.now() - 1000 * 60 * 60 * 24 }
    ]
  },
  {
    id: "conv_3",
    title: "Poetiq Integration Help",
    updatedAt: Date.now() - 1000 * 60 * 60 * 48, // 2 days ago
    messages: []
  }
];
