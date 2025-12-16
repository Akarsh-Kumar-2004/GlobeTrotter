import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ==== Types ====
interface ItineraryDay {
  day: string;
  city: string;
  morning: string;
  afternoon: string;
  evening: string;
  accommodation: string;
  meals: string;
  estimated_cost: string;
}

interface TravelPlan {
  itinerary: ItineraryDay[];
  total_estimated_cost: string;
  travel_tips: string[];
  packing_list: string[];
  emergency_contacts: {
    local_emergency: string;
    embassy: string;
    hotel: string;
  };
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const PROMPT_TEMPLATE = `
You are an expert travel planner. Create a multi-city itinerary.

DESTINATIONS: {destinations}
TRIP_DATES: {start_date} to {end_date} ({duration} days)
BUDGET: {budget}
TRAVEL_STYLE: {travel_style}
INTERESTS: {interests}
ACCOMMODATION_PREFERENCE: {accommodation}
TRANSPORTATION_PREFERENCE: {transportation}
SPECIAL_REQUESTS: {special_requests}

Important:
1. Divide the trip days between the cities in a logical way.
2. Each itinerary day must include the "city" field.
3. ALL costs must be provided in Indian Rupees (₹) regardless of destination country.
4. For international destinations, convert local currency to INR using approximate exchange rates:
   - USD to INR: 1 USD ≈ ₹85
   - EUR to INR: 1 EUR ≈ ₹92
   - GBP to INR: 1 GBP ≈ ₹108
   - JPY to INR: 1 JPY ≈ ₹0.58
   - AUD to INR: 1 AUD ≈ ₹56
   - CAD to INR: 1 CAD ≈ ₹63
5. Always prefix costs with ₹ symbol (e.g., "₹2,500", "₹15,000")
6. Respond with ONLY valid JSON - no markdown formatting, no backticks, no code blocks. Start directly with the opening brace { and end with the closing brace }.

{
  "itinerary": [
    {
      "day": "Day 1",
      "city": "City Name",
      "morning": "Activity",
      "afternoon": "Activity",
      "evening": "Activity",
      "accommodation": "Hotel",
      "meals": "Breakfast, lunch suggestion",
      "estimated_cost": "₹2,500"
    }
  ],
  "total_estimated_cost": "₹15,000",
  "travel_tips": ["Tip1", "Tip2"],
  "packing_list": ["Item1", "Item2"],
  "emergency_contacts": {
    "local_emergency": "Number",
    "embassy": "Number",
    "hotel": "Number"
  }
}
`;

export async function POST(req: Request) {
  try {
    const {
      destinations,
      start_date,
      end_date,
      budget,
      travel_style,
      interests,
      accommodation,
      transportation,
      special_requests
    } = await req.json();

    const duration =
      Math.ceil(
        (new Date(end_date).getTime() -
          new Date(start_date).getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1;

    const prompt = PROMPT_TEMPLATE
      .replace("{destinations}", destinations.join(", "))
      .replace("{start_date}", start_date)
      .replace("{end_date}", end_date)
      .replace("{duration}", duration.toString())
      .replace("{budget}", budget)
      .replace("{travel_style}", travel_style)
      .replace("{interests}", interests.join(", "))
      .replace("{accommodation}", accommodation)
      .replace("{transportation}", transportation)
      .replace("{special_requests}", special_requests || "None");

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    let text =
      result.response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    text = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    let travelPlan: TravelPlan;
    try {
      travelPlan = JSON.parse(text);
    } catch (parseError) {
      
      let fixed = text;
      
      
      fixed = fixed.replace(/,(\s*[}\]])/g, "$1");
      
      
      fixed = fixed.replace(/`/g, "").trim();
      
      try {
        travelPlan = JSON.parse(fixed);
      } catch (secondError) {
        throw new Error(`Failed to parse AI response as JSON: ${text.substring(0, 100)}...`);
      }
    }

    
    const convertToRupees = (costString: string): string => {
      if (!costString) return "₹0";
      
      
      const cleanCost = costString.replace(/[₹$€£¥₽₩₪₨₦₡₢₣₤₥₦₧₨₩₪₫₭₮₯₰₱₲₳₴₵₶₷₸₹₺₻₼₽₾₿]/g, '').trim();
      

      const cost = parseFloat(cleanCost.replace(/,/g, ''));
      if (isNaN(cost)) return "₹0"; // Return ₹0 if not a number
      
      
      if (costString.includes('$')) {
        const rupees = Math.round(cost * 85);
        return `₹${rupees}`;
      }
      
      
      if (costString.includes('€')) {
        const rupees = Math.round(cost * 92);
        return `₹${rupees}`;
      }
      
      
      if (costString.includes('£')) {
        const rupees = Math.round(cost * 108);
        return `₹${rupees}`;
      }
      
      
      if (!costString.includes('₹')) {
        return `₹${cost}`;
      }
      
      
      return costString.includes('₹') ? costString : `₹${cost}`;
    };

  
    if (travelPlan.itinerary) {
      travelPlan.itinerary.forEach((day: ItineraryDay) => {
        if (day.estimated_cost) {
          day.estimated_cost = convertToRupees(day.estimated_cost);
        }
      });
    }
    
    if (travelPlan.total_estimated_cost) {
      travelPlan.total_estimated_cost = convertToRupees(travelPlan.total_estimated_cost);
    }

    return NextResponse.json({
      plan: travelPlan,
      summary: `Multi-city trip to ${destinations.join(", ")} from ${start_date} to ${end_date}. Estimated budget: ${travelPlan.total_estimated_cost}`
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
