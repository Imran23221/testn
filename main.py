import datetime
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
import io

# Setup Database
DATABASE_URL = "sqlite:///./premium_study.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Database Models
class UserUploadLog(BaseModel):
    pass

class UploadRecord(Base):
    __tablename__ = "upload_records"
    id = Column(Integer, primary_key=True, index=True)
    user_email = Column(String, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)

Base.metadata.create_all(bind=engine)

# FastAPI App Setup
app = FastAPI(title="Premium AI Study & Mental Recovery Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Mock AI Logic Engine to safely parse text/PDF context and generate highly structured study materials
def generate_ai_materials(text_content: str):
    lines = [line.strip() for line in text_content.split('\n') if len(line.strip()) > 10]
    if not lines:
        lines = ["Introduction to Advanced Cognitive Systems", "Active Recall optimizes memory consolidation", "Cortical plastic changes occur during deep sleep cycles"]
    
    flashcards = []
    quizzes = []
    
    for i, line in enumerate(lines[:4]):
        flashcards.append({
            "id": i + 1,
            "front": f"Key concept identified from material: Core Point {i+1}",
            "back": line
        })
        
    for i, line in enumerate(lines[:3]):
        quizzes.append({
            "id": i + 1,
            "question": f"Based on your notes, complete or explain this key insight: '{line[:40]}...'",
            "options": [line, "An unrelated distractor concept", "A secondary alternative thesis", "None of the above"],
            "correct": line
        })
        
    return {"flashcards": flashcards, "quizzes": quizzes}

@app.post("/api/upload")
async def upload_material(
    email: str = Form(...), 
    is_premium: bool = Form(False),
    file: UploadFile = File(...), 
    db: Session = Depends(get_db)
):
    # Enforce Rate Limiting for Free tier
    if not is_premium:
        twenty_four_hours_ago = datetime.datetime.utcnow() - datetime.timedelta(hours=24)
        recent_upload = db.query(UploadRecord).filter(
            UploadRecord.user_email == email,
            UploadRecord.timestamp >= twenty_four_hours_ago
        ).first()
        
        if recent_upload:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Free tier users are strictly limited to 1 upload every 24 hours."
            )
            
    # Read and parse file text content
    try:
        contents = await file.read()
        text_content = contents.decode("utf-8", errors="ignore")
    except Exception:
        text_content = "Failed to parse structured documents. Defaulting to system template variables."

    # Log successful upload
    new_record = UploadRecord(user_email=email)
    db.add(new_record)
    db.commit()

    # Generate structural flashcards & quizzes
    study_materials = generate_ai_materials(text_content)
    return study_materials

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)