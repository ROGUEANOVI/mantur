export const authCopy = {
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
    },
  },
  signup: {
    title: 'Crea tu cuenta',
    subtitle: 'Únete a la comunidad de VayaTur',
    fullName: 'Nombre completo',
    email: 'Correo electrónico',
    password: 'Contraseña',
    roleLabel: 'Soy...',
    roles: {
      tourist: 'Turista',
      business_owner: 'Dueño de negocio',
      transporter: 'Transportador (motocarro)',
    },
    submit: 'Crear cuenta',
    hasAccount: '¿Ya tienes cuenta?',
    loginLink: 'Inicia sesión',
    errors: {
      emailInUse: 'Este correo ya está registrado',
      weakPassword: 'La contraseña debe tener al menos 6 caracteres',
      generic: 'Ocurrió un error. Intenta de nuevo.',
    },
  },
} as const
