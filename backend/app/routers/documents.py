from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import UPLOAD_DIR
from app.database import get_db
from app.models import Document, Load, User
from app.schemas import DocumentOut

router = APIRouter(prefix="/loads", tags=["documents"])

ALLOWED_TYPES = {"bol", "pod", "rate_con", "other"}


@router.post("/{load_id}/documents", response_model=DocumentOut, status_code=201)
async def upload_document(
    load_id: int,
    doc_type: str = Form("other"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    load = db.get(Load, load_id)
    if not load:
        raise HTTPException(status_code=404, detail="Load not found")
    if doc_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Invalid document type")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    original = Path(file.filename or "upload.bin").name
    stored_name = f"{load_id}_{uuid4().hex}_{original}"
    dest = UPLOAD_DIR / stored_name
    dest.write_bytes(await file.read())
    row = Document(
        load_id=load_id,
        doc_type=doc_type,
        filename=original,
        stored_path=str(dest),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/{load_id}/documents/{doc_id}")
def download_document(
    load_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    row = db.get(Document, doc_id)
    if not row or row.load_id != load_id:
        raise HTTPException(status_code=404, detail="Document not found")
    path = Path(row.stored_path) if row.stored_path else None
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="File is not stored on disk")
    return FileResponse(path, filename=row.filename)


@router.delete("/{load_id}/documents/{doc_id}", status_code=204)
def delete_document(
    load_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    row = db.get(Document, doc_id)
    if not row or row.load_id != load_id:
        raise HTTPException(status_code=404, detail="Document not found")
    path = Path(row.stored_path) if row.stored_path else None
    if path and path.exists():
        path.unlink()
    db.delete(row)
    db.commit()
