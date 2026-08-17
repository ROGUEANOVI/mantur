export const roleRequestsCopy = {
  page: {
    title: 'Haz parte de ManTur',
    subtitle: 'ManTur conecta a los turistas con lo mejor de Manaure. Si eres parte de esa oferta, este es tu espacio.',
  },

  roles: {
    business_owner: 'Dueño de negocio',
    transporter:    'Transportador',
    tourist_guide:  'Guía turístico',
  },

  roleCards: {
    business_owner: {
      hook:  '¿Tienes un negocio en Manaure?',
      value: 'Publica tu negocio, gestiona experiencias y recibe reservas directas de turistas.',
      cta:   'Quiero registrar mi negocio',
    },
    transporter: {
      hook:  '¿Ofreces transporte en Manaure?',
      value: 'Conecta con turistas que necesitan movilizarse por la región en motocarro u otro vehículo.',
      cta:   'Quiero ofrecer transporte',
    },
    tourist_guide: {
      hook:  '¿Conoces Manaure mejor que nadie?',
      value: 'Comparte tu conocimiento local y guía a los visitantes por los rincones más especiales de la región.',
      cta:   'Quiero ser guía turístico',
    },
  },

  form: {
    title: 'Completa tu solicitud',
    notesLabel: 'Algo más que quieras contarnos (opcional)',
    notesPlaceholder: 'Información adicional que quieras compartir con el equipo de ManTur...',
    submit: 'Enviar solicitud',
    submitting: 'Enviando...',
    back: 'Elegir otro rol',

    businessOwner: {
      businessName: 'Nombre del negocio',
      businessNamePlaceholder: 'Ej: Balneario El Edén',
      categories: 'Categorías del negocio',
      categoriesHint: 'Selecciona todas las que aplican.',
      phone: 'Teléfono de contacto',
      phonePlaceholder: 'Ej: 300 123 4567',
      location: 'Ubicación (opcional)',
      locationHint: 'Tocá el mapa para marcar dónde queda tu negocio. Podés agregarla después si preferís.',
    },

    transporter: {
      licensePlate: 'Placa del vehículo',
      licensePlatePlaceholder: 'Ej: ABC-123',
      vehicleType: 'Tipo de vehículo',
      vehicleTypes: {
        motocarro: 'Motocarro',
        moto:      'Moto',
        camioneta: 'Camioneta',
        otro:      'Otro',
      },
      phone: 'Teléfono de contacto',
      phonePlaceholder: 'Ej: 300 123 4567',
    },

    touristGuide: {
      specialties: 'Especialidades',
      specialtyOptions: {
        hiking:          'Senderismo',
        ecotourism:      'Ecoturismo',
        history_culture: 'Historia y cultura',
        local_gastronomy:'Gastronomía local',
        photography:     'Fotografía de paisajes',
        birdwatching:    'Avistamiento de aves',
        other:           'Otro',
      },
      languages: 'Idiomas',
      languageOptions: {
        spanish: 'Español',
        english: 'Inglés',
        other:   'Otro idioma',
      },
      phone:                      'Teléfono de contacto',
      phonePlaceholder:           'Ej: 300 123 4567',
      experienceYears:            'Años de experiencia',
      experienceYearsPlaceholder: 'Ej: 3',
      bio:                        'Presentación',
      bioPlaceholder:             'Cuéntale a los turistas quién eres y qué recorridos ofreces...',
    },
  },

  status: {
    lastRequestLabel: 'Tu última solicitud',
    pending: {
      title:       'Solicitud en revisión',
      description: 'Tu solicitud fue recibida. El equipo de ManTur la revisará pronto y te notificaremos.',
    },
    approved: {
      title:       'Ya eres parte de ManTur',
      description: 'Tu rol fue aprobado.',
    },
    rejected: {
      title:            'Solicitud rechazada',
      descriptionPrefix:'Motivo:',
      resubmit:         'Enviar nueva solicitud',
    },
  },

  alreadyHasRole: 'Tu cuenta ya tiene un rol activo en ManTur.',

  success: 'Solicitud enviada. El equipo la revisará pronto.',

  errors: {
    alreadyPending: 'Ya tienes una solicitud pendiente para este rol.',
    alreadyHasRole: 'Tu cuenta ya tiene este rol.',
    missingFields:  'Completa todos los campos requeridos.',
    generic:        'Ocurrió un error. Intenta de nuevo.',
    rateLimited:    'Demasiadas solicitudes. Espera un momento e intenta de nuevo.',
    invalidPhone:   'Escribe un número de celular colombiano válido (10 dígitos, ej: 300 123 4567).',
    invalidCoords:  'Las coordenadas deben ser números válidos.',
    invalidLicensePlate: 'Escribe una placa colombiana válida (ej: ABC123).',
    invalidVehicleType: 'Selecciona un tipo de vehículo válido.',
    invalidExperienceYears: 'Los años de experiencia deben estar entre 0 y 60.',
  },
} as const
