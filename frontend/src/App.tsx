import { Route, Routes } from "react-router-dom";
import { AdminPage } from "./features/admin/admin-page";
import { ChatPage } from "./features/chat/chat-page";

function App() {
  return (
    <Routes>
      <Route path="/" element={<ChatPage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  );
}

export default App;
