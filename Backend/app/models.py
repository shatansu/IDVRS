import enum
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Numeric,
    Boolean,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Text,
    func
)
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import relationship
from app.database import Base

class SourceModeEnum(str, enum.Enum):
    digital_text = "digital_text"
    ocr = "ocr"

class ProcessingStatusEnum(str, enum.Enum):
    processing = "processing"
    completed = "completed"
    failed = "failed"

class ReviewStatusEnum(str, enum.Enum):
    pending_review = "pending_review"
    verified = "verified"

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    original_filename = Column(String(255), nullable=True)
    file_path = Column(String(500), nullable=True)
    document_type = Column(String(255), nullable=True)  # 'bhu_adhikar_pustika', 'khatoni_b1', 'other', or descriptive
    source_mode = Column(
        SQLEnum(SourceModeEnum, values_callable=lambda obj: [e.value for e in obj]),
        default=SourceModeEnum.digital_text,
        nullable=False
    )
    uploaded_at = Column(DateTime, server_default=func.now(), nullable=False)
    raw_extracted_text = Column(LONGTEXT, nullable=True)
    processing_status = Column(
        SQLEnum(ProcessingStatusEnum, values_callable=lambda obj: [e.value for e in obj]),
        default=ProcessingStatusEnum.processing,
        nullable=False
    )

    # Relationships
    khatas = relationship("Khata", back_populates="document", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Document(id={self.id}, filename='{self.original_filename}', status='{self.processing_status}')>"


class Khata(Base):
    __tablename__ = "khatas"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=True)
    clrm_no = Column(String(50), nullable=True, index=True)
    clrm_no_confidence = Column(Float, nullable=True)
    khata_number = Column(String(50), nullable=True, index=True)
    khata_number_confidence = Column(Float, nullable=True)
    village = Column(String(255), nullable=True)
    village_confidence = Column(Float, nullable=True)
    patwari_halka_no = Column(String(100), nullable=True)
    tehsil = Column(String(255), nullable=True)
    tehsil_confidence = Column(Float, nullable=True)
    district = Column(String(255), nullable=True)
    district_confidence = Column(Float, nullable=True)
    state = Column(String(255), nullable=True)
    fasli_year = Column(String(20), nullable=True)
    is_duplicate_flag = Column(Boolean, default=False, nullable=False)
    review_status = Column(
        SQLEnum(ReviewStatusEnum, values_callable=lambda obj: [e.value for e in obj]),
        default=ReviewStatusEnum.pending_review,
        nullable=False
    )
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    # Relationships
    document = relationship("Document", back_populates="khatas")
    owners = relationship("KhataOwner", back_populates="khata", cascade="all, delete-orphan")
    parcels = relationship("KhataParcel", back_populates="khata", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Khata(id={self.id}, khata_no='{self.khata_number}', village='{self.village}')>"


class KhataOwner(Base):
    __tablename__ = "khata_owners"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    khata_id = Column(Integer, ForeignKey("khatas.id", ondelete="CASCADE"), nullable=False)
    owner_name = Column(String(255), nullable=True)
    owner_name_confidence = Column(Float, nullable=True)
    parent_or_spouse_name = Column(String(255), nullable=True)
    address = Column(String(500), nullable=True)
    share_fraction = Column(String(20), nullable=True)  # e.g. "1/15", "1/3"
    share_fraction_confidence = Column(Float, nullable=True)
    ownership_status = Column(String(100), nullable=True)  # e.g. "भूमि स्वामी"
    owner_id_no = Column(String(100), nullable=True)

    # Relationship
    khata = relationship("Khata", back_populates="owners")

    def __repr__(self):
        return f"<KhataOwner(id={self.id}, owner_name='{self.owner_name}', share='{self.share_fraction}')>"


class KhataParcel(Base):
    __tablename__ = "khata_parcels"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    khata_id = Column(Integer, ForeignKey("khatas.id", ondelete="CASCADE"), nullable=False)
    parcel_unique_id = Column(String(100), nullable=True)
    survey_number = Column(String(50), nullable=True, index=True)
    survey_number_confidence = Column(Float, nullable=True)
    land_use_flag = Column(String(1), nullable=True)  # 'S' (agricultural) or 'P' (non-agricultural)
    area_hectare = Column(Numeric(10, 4), nullable=True)
    area_hectare_confidence = Column(Float, nullable=True)
    land_use = Column(String(100), nullable=True)  # e.g. "कृषि"
    land_revenue_rs = Column(Numeric(10, 2), nullable=True)

    # Relationship
    khata = relationship("Khata", back_populates="parcels")

    def __repr__(self):
        return f"<KhataParcel(id={self.id}, survey_no='{self.survey_number}', area={self.area_hectare})>"
