import { ContactPerson } from "@/components/leads/smart-form/ContactDetailsSection";
import { isProfessionalDesignation } from "@/constants/leadConstants";

export function serializeCustomerAdditionalContacts(
  contacts: ContactPerson[],
) {
  return contacts.slice(1).map((contact) => ({
    designation: contact.designation,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    alternatePhone: contact.alternatePhone,
    firmName: contact.firmName,
    isProfessional: isProfessionalDesignation(contact.designation),
  }));
}
