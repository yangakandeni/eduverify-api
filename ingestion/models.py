"""Pydantic schema for a parsed DHET-registered private higher education institution."""

from typing import List, Optional

from pydantic import BaseModel, Field


class Contacts(BaseModel):
    email: List[str] = Field(default_factory=list)
    phone: List[str] = Field(default_factory=list)
    website: Optional[str] = None


class Institution(BaseModel):
    name: str
    registration_number: Optional[str] = None
    status: Optional[str] = None
    address: str = ""
    province: Optional[str] = None
    contacts: Contacts = Field(default_factory=Contacts)
    qualifications: List[str] = Field(default_factory=list)
    cancellation_reason: Optional[str] = None


class SaqaQualification(BaseModel):
    """A single SAQA NLRD qualification registration row, from any NQF sub-framework
    (HEQSF, OQSF, GFETQSF, SFAP, SFNA). `framework` is the per-row discriminator callers
    use to filter to a specific sub-framework (e.g. EduVerify's own bake step filters to
    HEQSF only) — filtering is a consumer-time concern, not an ingestion-time one."""

    qualId: int
    title: str
    nqfLevel: Optional[int] = None
    nqfLevelRaw: str
    credits: Optional[int] = None
    subfield: str
    originator: str
    framework: str
