          referredByForLead = {
            id: professional.id,
            name: professional.name,
            firmName: professional.firm_name || "",
            type: normalizeProfessionalRefType(professional.professional_type),
            phone: professional.phone || undefined,
            email: professional.email || undefined,
          };
        }
      }
