import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useToast } from "@/hooks/use-toast";
import { Calculator, User, Send, Loader2, Wrench, Equal, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger,} from "@/components/ui/collapsible";

// ============================================
// TYPES - Define the shape of our data
// ============================================

interface ToolInfo {
  toolUsed: string | null;
  arguments: { a: number; b: number } | null;
  result: number | string | null;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolInfo?: ToolInfo;
  timestamp: Date;
}

// Response from our edge function that uses AI tool calling
interface CalculatorResponse {
  toolUsed: string | null;      // Which tool the AI selected (add_num, sub_num, etc.)
  arguments: { a: number; b: number } | null;  // The numbers extracted from the message
  result: number | string | null;  // The calculation result
  finalAnswer: string;          // The AI's natural language response
  error?: string;
}

// Display names for the tools
const toolDisplayNames: Record<string, string> = {
  add_num: "Addition",
  sub_num: "Subtraction",
  mul_num: "Multiplication",
  div_num: "Division",
};

const toolOperators: Record<string, string> = {
  add_num: "+",
  sub_num: "−",
  mul_num: "×",
  div_num: "÷",
};

// ============================================
// MAIN COMPONENT - Everything in one place!
// ============================================

export function CalculatorChat() {
  // ==========================================
  // STATE - Conversation history & UI state
  // ==========================================
  const [messages, setMessages] = useState<Message[]>([]);  // All messages in the conversation
  const [input, setInput] = useState("");                    // Current input text
  const [isLoading, setIsLoading] = useState(false);         // Loading state during API call
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // ==========================================
  // API CALL - This is where tool calling happens!
  // ==========================================
  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");

    // 1. Add user message to history
    const newUserMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      // ==========================================
      // THE API CALL TO OUR EDGE FUNCTION
      // This edge function uses Lovable AI Gateway
      // with tool calling to perform calculations
      // ==========================================
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calculator`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ message: userMessage }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error: ${response.status}`);
      }

      // ==========================================
      // PARSE THE RESPONSE
      // The response contains:
      // - toolUsed: Which tool the AI chose (add_num, sub_num, mul_num, div_num)
      // - arguments: The numbers extracted from the user's message
      // - result: The calculation result from executing the tool
      // - finalAnswer: The AI's natural language response
      // ==========================================
      const data: CalculatorResponse = await response.json();

      console.log("=== TOOL CALLING RESPONSE ===");
      console.log("Tool Used:", data.toolUsed);
      console.log("Arguments:", data.arguments);
      console.log("Result:", data.result);
      console.log("Final Answer:", data.finalAnswer);
      console.log("=============================");

      if (data.error) {
        throw new Error(data.error);
      }

      // 2. Add assistant message with tool info to history
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.finalAnswer,
        toolInfo: {
          toolUsed: data.toolUsed,
          arguments: data.arguments,
          result: data.result,
        },
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

    } catch (error) {
      console.error("Calculator error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process your question",
        variant: "destructive",
      });
      
      // Add error message to chat
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Sorry, I encountered an error processing your question. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ==========================================
  // RENDER - The UI
  // ==========================================
  return (
    <div className="flex flex-col h-[600px] max-w-2xl mx-auto border border-border rounded-xl overflow-hidden bg-background shadow-lg">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border bg-muted/30">
        <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
          <Calculator className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">AI Calculator</h2>
          <p className="text-xs text-muted-foreground">
            Ask me any math question in plain English
          </p>
        </div>
      </div>

      {/* ==========================================
          CONVERSATION HISTORY
          All messages are stored in the messages array
          ========================================== */}
      <ScrollArea className="flex-1 p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <Calculator className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">Welcome to AI Calculator!</p>
            <p className="text-sm mt-2 max-w-sm">Try asking questions like:</p>
            <ul className="text-sm mt-2 space-y-1">
              <li>"What is 18 multiplied by 7?"</li>
              <li>"Add 25 and 17"</li>
              <li>"What's 100 divided by 4?"</li>
              <li>"Subtract 15 from 42"</li>
            </ul>
          </div>
        ) : (
          <div>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={scrollRef} />
          </div>
        )}
      </ScrollArea>

      {/* ==========================================
          INPUT AREA
          User types their math question here
          ========================================== */}
      <div className="flex gap-2 p-4 border-t border-border bg-background">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a math question... (e.g., What is 18 multiplied by 7?)"
          disabled={isLoading}
          className="flex-1"
        />
        <Button
          onClick={sendMessage}
          disabled={!input.trim() || isLoading}
          size="icon"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

// ==========================================
// MESSAGE BUBBLE COMPONENT
// Displays a single message with tool info
// ==========================================
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex gap-3 mb-4",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
        )}
      >
        {isUser ? <User className="w-4 h-4" /> : <Calculator className="w-4 h-4" />}
      </div>
      <div
        className={cn(
          "flex flex-col gap-2 max-w-[80%]",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-2",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted text-foreground rounded-tl-sm"
          )}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
        {/* Show tool info for assistant messages that used a tool */}
        {message.toolInfo && message.toolInfo.toolUsed && (
          <ToolReasoningCard toolInfo={message.toolInfo} />
        )}
      </div>
    </div>
  );
}

// ==========================================
// TOOL REASONING CARD
// Shows the AI's reasoning: tool, args, result
// ==========================================
function ToolReasoningCard({ toolInfo }: { toolInfo: ToolInfo }) {
  const [isOpen, setIsOpen] = useState(true);

  if (!toolInfo.toolUsed) return null;

  const displayName = toolDisplayNames[toolInfo.toolUsed] || toolInfo.toolUsed;
  const operator = toolOperators[toolInfo.toolUsed] || "?";

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="bg-card/50 border-border/50 w-full max-w-xs">
        <CollapsibleTrigger className="w-full">
          <CardHeader className="py-2 px-3 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="w-3 h-3 text-muted-foreground" />
              <CardTitle className="text-xs font-medium text-muted-foreground">
                AI Reasoning
              </CardTitle>
            </div>
            <ChevronDown
              className={cn(
                "w-3 h-3 text-muted-foreground transition-transform",
                isOpen && "rotate-180"
              )}
            />
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="py-2 px-3 pt-0 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Tool:</span>
              <span className="font-mono bg-secondary px-2 py-0.5 rounded text-xs">
                {displayName}
              </span>
            </div>
            {toolInfo.arguments && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Args:</span>
                <span className="font-mono">
                  {toolInfo.arguments.a} {operator} {toolInfo.arguments.b}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Equal className="w-3 h-3 text-muted-foreground" />
              <span className="font-semibold text-primary">
                {toolInfo.result}
              </span>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
