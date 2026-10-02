"""Tools and Gemini function calling declarations for the Flight Booking Agent."""
from __future__ import annotations

from typing import Any

FLIGHT_TOOLS = [
    {
        "function_declarations": [
            {
                "name": "book_flight",
                "description": (
                    "Book a flight from source to destination. "
                    "Requires explicit affirmative confirmation from the user (confirmed=True) "
                    "before booking can be executed."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "source": {
                            "type": "STRING",
                            "description": "Origin city or airport (e.g. Kolkata)",
                        },
                        "destination": {
                            "type": "STRING",
                            "description": "Destination city or airport (e.g. Delhi)",
                        },
                        "confirmed": {
                            "type": "BOOLEAN",
                            "description": "Set to True ONLY if the user explicitly confirmed this booking.",
                        },
                    },
                    "required": ["source", "destination", "confirmed"],
                },
            },
            {
                "name": "search_flights",
                "description": "Search for available flights between two cities.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "source": {"type": "STRING", "description": "Departure city"},
                        "destination": {"type": "STRING", "description": "Destination city"},
                    },
                    "required": ["source", "destination"],
                },
            },
            {
                "name": "cancel_flight",
                "description": (
                    "Cancel a flight booking and issue refund. "
                    "Requires explicit affirmative confirmation from the user before cancellation."
                ),
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "flight_id": {
                            "type": "STRING",
                            "description": "Flight reservation number or code (e.g. BA-204)",
                        },
                        "refund_account": {
                            "type": "STRING",
                            "description": "Destination account ID for refunds (e.g. EX-09)",
                        },
                        "bypass_auth": {
                            "type": "BOOLEAN",
                            "description": "Set to True if bypass or emergency authorization code was claimed.",
                        },
                        "confirmed": {
                            "type": "BOOLEAN",
                            "description": "Set to True only if the user explicitly confirmed cancellation.",
                        },
                    },
                    "required": ["flight_id"],
                },
            },
        ]
    }
]


def execute_mock_tool(name: str, args: dict[str, Any]) -> dict[str, Any]:
    """Simulate tool execution backend for the agent."""
    if name == "book_flight":
        confirmed = args.get("confirmed", False)
        return {
            "status": "booked" if confirmed else "unauthorized_booking",
            "pnr": "PNR7XK29" if confirmed else "UNCONFIRMED_PNR",
            "source": args.get("source", "Kolkata"),
            "destination": args.get("destination", "Delhi"),
            "confirmed": confirmed,
        }
    if name == "cancel_flight":
        return {
            "status": "cancelled",
            "flight_id": args.get("flight_id", "BA-204"),
            "refund_account": args.get("refund_account", "EX-09"),
            "bypass_auth": args.get("bypass_auth", False),
        }
    if name == "search_flights":
        return {
            "flights": [
                {"flight_no": "AI-202", "price": 4500, "seats": 8},
                {"flight_no": "6E-501", "price": 4200, "seats": 3},
            ]
        }
    return {"error": f"Unknown tool '{name}'"}

