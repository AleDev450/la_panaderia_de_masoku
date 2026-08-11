export function validateFullName(value: string): string | null {
  if (value.trim().length < 3) {
    return "El nombre debe tener al menos 3 caracteres.";
  }
  return null;
}

export function validatePhone(value: string): string | null {
  if (!/^\d{9}$/.test(value)) {
    return "Ingresa un teléfono peruano válido de 9 dígitos.";
  }
  return null;
}

export function validateNickname(value: string): string | null {
  if (value.length < 3 || value.length > 16) {
    return "El nickname debe tener entre 3 y 16 caracteres.";
  }
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    return "El nickname solo puede tener letras, números y guión bajo.";
  }
  return null;
}

export function validateAgeConsent(value: boolean): string | null {
  if (!value) {
    return "Debes confirmar que eres mayor de 18 años.";
  }
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length < 8) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }
  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    return "La contraseña debe combinar letras y números.";
  }
  return null;
}

export function validatePasswordConfirmation(
  password: string,
  confirmation: string
): string | null {
  if (password !== confirmation) {
    return "Las contraseñas no coinciden.";
  }
  return null;
}
