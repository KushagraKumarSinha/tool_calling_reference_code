import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Calculator functions
function add_num(a: number, b: number): number {return a + b;}

function sub_num(a: number, b: number): number {return a - b;}

function mul_num(a: number, b: number): number {return a * b;}

function div_num(a: number, b: number): number | string {
  if (b === 0) return "Error: division by zero";
  return a / b;
}

const functionMap: Record<string, (a: number, b: number) => number | string> = {
  add_num,
  sub_num,
  mul_num,
  div_num,
};

// Tool definitions for the AI
const tools = [
  {
    type: "function",
    function: {
      name: "add_num",
      description: "Add two numbers together",
      parameters: {
        type: "object",
        properties: {
          a: { type: "number", description: "First number" },
          b: { type: "number", description: "Second number" },
        },
        required: ["a", "b"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sub_num",
      description: "Subtract second number from first number",
      parameters: {
        type: "object",
        properties: {
          a: { type: "number", description: "First number" },
          b: { type: "number", description: "Second number to subtract" },
        },
        required: ["a", "b"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mul_num",
      description: "Multiply two numbers together",
      parameters: {
        type: "object",
        properties: {
          a: { type: "number", description: "First number" },
          b: { type: "number", description: "Second number" },
        },
        required: ["a", "b"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "div_num",
      description: "Divide first number by second number",
      parameters: {
        type: "object",
        properties: {
          a: { type: "number", description: "Dividend (number to be divided)" },
          b: { type: "number", description: "Divisor (number to divide by)" },
        },
        required: ["a", "b"],
      },
    },
  },
];

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Received message:", message);

    // Step 1: Ask AI what tool to use
    const initialResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a helpful calculator assistant. When users ask math questions, use the appropriate tool to calculate the answer. Available operations are: add_num (addition), sub_num (subtraction), mul_num (multiplication), div_num (division).`,
          },
          { role: "user", content: message },
        ],
        tools,
        tool_choice: "auto",
      }),
    });

    if (!initialResponse.ok) {
      const errorText = await initialResponse.text();
      console.error("AI gateway error:", initialResponse.status, errorText);
      
      if (initialResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (initialResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add funds to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${initialResponse.status}`);
    }

    const initialData = await initialResponse.json();
    console.log("Initial AI response:", JSON.stringify(initialData, null, 2));

    const assistantMessage = initialData.choices?.[0]?.message;
    const toolCalls = assistantMessage?.tool_calls;

    // If no tool calls, return the direct response
    if (!toolCalls || toolCalls.length === 0) {
      return new Response(
        JSON.stringify({
          toolUsed: null,
          arguments: null,
          result: null,
          finalAnswer: assistantMessage?.content || "I couldn't understand that math question. Please try rephrasing.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Execute the tool call
    const toolCall = toolCalls[0];
    const functionName = toolCall.function.name;
    const args = JSON.parse(toolCall.function.arguments);

    console.log(`Tool requested: ${functionName}`, args);

    // Execute the function
    const calculationResult = functionMap[functionName](args.a, args.b);
    console.log(`Calculation result: ${calculationResult}`);

    // Step 3: Send result back to AI for final response
    const finalResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a helpful calculator assistant. Provide a clear, friendly response with the calculation result.`,
          },
          { role: "user", content: message },
          assistantMessage,
          {
            role: "tool",
            tool_call_id: toolCall.id,
            content: String(calculationResult),
          },
        ],
      }),
    });

    if (!finalResponse.ok) {
      const errorText = await finalResponse.text();
      console.error("Final AI response error:", finalResponse.status, errorText);
      throw new Error(`AI gateway error: ${finalResponse.status}`);
    }

    const finalData = await finalResponse.json();
    const finalAnswer = finalData.choices?.[0]?.message?.content || `The result is ${calculationResult}`;

    console.log("Final answer:", finalAnswer);

    return new Response(
      JSON.stringify({
        toolUsed: functionName,
        arguments: args,
        result: calculationResult,
        finalAnswer,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Calculator error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
