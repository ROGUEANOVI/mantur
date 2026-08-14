export const authCopy = {
  brand: {
    tagline: 'Turismo con alma local',
  },
  oauth: {
    google: 'Continuar con Google',
    divider: 'o continúa con',
  },
  login: {
    title: 'Bienvenido de nuevo',
    subtitle: 'Inicia sesión para explorar Manaure',
    email: 'Correo electrónico',
    password: 'Contraseña',
    submit: 'Iniciar sesión',
    noAccount: '¿No tienes cuenta?',
    signupLink: 'Regístrate',
    errors: {
      invalidCredentials: 'Correo o contraseña incorrectos',
      generic: 'Ocurrió un error. Intenta de nuevo.',
      oauthFailed: 'No se pudo iniciar sesión con Google. Intenta de nuevo.',
      confirmFailed: 'El enlace de confirmación no es válido o ya expiró. Intenta registrarte de nuevo.',
    },
  },
  signup: {
    title: 'Crea tu cuenta',
    subtitle: 'Únete a la comunidad de ManTur',
    fullName: 'Nombre completo',
    email: 'Correo electrónico',
    password: 'Contraseña',
    confirmPassword: 'Confirmar contraseña',
    roles: {
      tourist: 'Turista',
      business_owner: 'Dueño de negocio',
      transporter: 'Transportador (motocarro)',
    },
    submit: 'Crear cuenta',
    hasAccount: '¿Ya tienes cuenta?',
    loginLink: 'Inicia sesión',
    confirmationSent: {
      title: 'Revisa tu correo',
      body: 'Te enviamos un enlace para confirmar tu cuenta. Ábrelo desde tu correo para poder iniciar sesión.',
    },
    passwordRules: {
      minLength: 'Mínimo 8 caracteres',
      uppercase: 'Una letra mayúscula',
      digit: 'Un número',
      special: 'Un carácter especial',
    },
    errors: {
      emailInUse: 'Este correo ya está registrado',
      weakPassword: 'La contraseña no cumple los requisitos de seguridad',
      passwordMismatch: 'Las contraseñas no coinciden',
      generic: 'Ocurrió un error. Intenta de nuevo.',
    },
  },
} as const
