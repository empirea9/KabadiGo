from fastapi import FastAPI, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
import uvicorn
import os

app = FastAPI(title="Kabadi Connect API")

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, set this to your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mock database
db = {
    "pickups": []
}

@app.get("/")
def read_root():
    return {"message": "Kabadi Connect API is running!"}

# --- Frontend API Routes ---

@app.post("/api/pickup")
async def create_pickup(request: Request):
    """
    Called by the frontend to book a pickup.
    Normally, this would trigger the Twilio API call to the kabadiwala.
    """
    data = await request.json()
    
    # Store in DB (mock)
    pickup_id = len(db["pickups"]) + 1
    pickup = {
        "id": pickup_id,
        "address": data.get("address"),
        "waste_type": data.get("waste_type"),
        "status": "finding_agent"
    }
    db["pickups"].append(pickup)
    
    # TODO: Trigger Twilio Client here:
    # client.calls.create(
    #     url="https://<YOUR_NGROK_URL>/webhook/twilio/incoming",
    #     to="+919876543210", # Kabadiwala's number
    #     from_=os.getenv("TWILIO_NUMBER")
    # )
    
    return {"success": True, "pickup_id": pickup_id, "message": "Calling kabadiwala..."}


@app.get("/api/pickup/{pickup_id}")
async def get_pickup_status(pickup_id: int):
    """
    Frontend polls this to check if the kabadiwala accepted.
    """
    for p in db["pickups"]:
        if p["id"] == pickup_id:
            return p
    return {"error": "Not found"}


# --- Twilio Webhook Routes ---

@app.post("/webhook/twilio/incoming", response_class=HTMLResponse)
async def twilio_incoming(CallSid: str = Form(None)):
    """
    Twilio requests this TwiML when the kabadiwala answers the phone.
    """
    # We use XML string directly for simplicity, but you can use the twilio python SDK:
    # from twilio.twiml.voice_response import VoiceResponse, Gather
    
    twiml = """<?xml version="1.0" encoding="UTF-8"?>
    <Response>
        <Say language="hi-IN" voice="Polly.Aditi">Namaste. Aapke ilake mein ek naya kabadi pickup request hai. Accept karne ke liye ek dabayein.</Say>
        <Gather numDigits="1" action="/webhook/twilio/gather-accept" method="POST">
        </Gather>
    </Response>
    """
    return twiml

@app.post("/webhook/twilio/gather-accept", response_class=HTMLResponse)
async def twilio_gather(Digits: str = Form(None), CallSid: str = Form(None)):
    """
    If they press 1, tell them details and ask to connect.
    """
    if Digits == "1":
        twiml = """<?xml version="1.0" encoding="UTF-8"?>
        <Response>
            <Say language="hi-IN" voice="Polly.Aditi">Dhanyawad. Pickup address hai Sector 4, MG Road. Waste type: Plastic. Customer se baat karne ke liye ek dabayein.</Say>
            <Gather numDigits="1" action="/webhook/twilio/connect" method="POST"></Gather>
        </Response>
        """
        return twiml
    else:
        return """<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>"""

@app.post("/webhook/twilio/connect", response_class=HTMLResponse)
async def twilio_connect(Digits: str = Form(None)):
    """
    If they press 1 again, dial the customer.
    """
    if Digits == "1":
        twiml = """<?xml version="1.0" encoding="UTF-8"?>
        <Response>
            <Say language="hi-IN" voice="Polly.Aditi">Customer ko call connect kar rahe hain.</Say>
            <Dial>+917777777777</Dial> 
        </Response>
        """
        return twiml

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
