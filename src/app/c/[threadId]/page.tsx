import { ChatArea } from "@/components/chat/ChatArea";
import { StepsPanel } from "@/components/steps/StepsPanel";

export default function ThreadPage() {
  return (
    <div className="flex h-full min-h-0">
      <ChatArea />
      <StepsPanel />
    </div>
  );
}
