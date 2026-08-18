import pytest
from pydantic import ValidationError

from models import Contacts, Institution


def test_institution_requires_name():
    with pytest.raises(ValidationError):
        Institution(status="Registered")


def test_institution_defaults_for_missing_optional_fields():
    inst = Institution(name="Test Institution")
    assert inst.registration_number is None
    assert inst.status is None
    assert inst.address == ""
    assert inst.province is None
    assert inst.qualifications == []
    assert inst.contacts == Contacts()
    assert inst.cancellation_reason is None


def test_institution_full_record():
    inst = Institution(
        name="AAA School of Advertising (Pty) Ltd",
        registration_number="2000/HE07/015",
        status="Registered",
        address="A) Bryanston: The Braes Office Park, 3 Eaton Avenue, Bryanston, 2191",
        province="Gauteng",
        contacts=Contacts(email=["mkooblal@richfield.ac.za"], phone=["031 307 7170"], website="www.aaaschool.co.za"),
        qualifications=["1) Higher Certificate in Digital Marketing"],
    )
    dumped = inst.model_dump()
    assert dumped["name"] == "AAA School of Advertising (Pty) Ltd"
    assert dumped["contacts"]["email"] == ["mkooblal@richfield.ac.za"]
    assert dumped["qualifications"] == ["1) Higher Certificate in Digital Marketing"]


def test_contacts_defaults_are_empty_not_none():
    contacts = Contacts()
    assert contacts.email == []
    assert contacts.phone == []
    assert contacts.website is None
