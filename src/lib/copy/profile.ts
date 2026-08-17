export const profileCopy = {
  page: {
    title: 'Mi perfil',
    back: 'Volver',
  },

  avatar: {
    changePhoto: 'Cambiar foto',
    removePhoto: 'Quitar foto',
    uploading: 'Subiendo...',
    changePhotoAria: 'Cambiar foto de perfil',
    cropTitle: 'Ajusta tu foto',
    cropDescription: 'Arrastra y haz zoom para encuadrar tu foto de perfil.',
    cropZoomLabel: 'Zoom',
    cropCancel: 'Cancelar',
    cropConfirm: 'Usar foto',
    cropProcessing: 'Procesando...',
  },

  form: {
    fullName: 'Nombre completo',
    fullNamePlaceholder: 'Ej: Ana Pérez',
    phone: 'Teléfono',
    phonePlaceholder: 'Ej: 300 123 4567',
    email: 'Correo electrónico',
    emailHint: 'El correo no se puede cambiar desde aquí.',
    save: 'Guardar cambios',
    saving: 'Guardando...',
    saved: '¡Perfil actualizado!',
  },

  errors: {
    nameRequired: 'El nombre es obligatorio.',
    invalidName: 'El nombre solo puede contener letras y espacios.',
    invalidFile: 'Selecciona una imagen.',
    invalidFormat: 'Formato no válido. Usa JPEG, PNG o WebP.',
    fileTooLarge: 'La imagen no puede superar 2 MB.',
    uploadFailed: 'No se pudo subir la foto. Intenta de nuevo.',
    saveFailed: 'No se pudo guardar la foto.',
    generic: 'Ocurrió un error. Intenta de nuevo.',
    compressionFailed: 'Error al procesar la imagen. Intenta de nuevo.',
    cropFailed: 'No se pudo recortar la imagen. Intenta de nuevo.',
    invalidPhone: 'Escribe un número de celular colombiano válido (10 dígitos, ej: 300 123 4567).',
  },
} as const
