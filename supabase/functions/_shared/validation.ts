// Shared validation utilities for edge functions

export const VALID_ROLES = ['super_admin', 'admin', 'manager', 'sales_user', 'sales_viewer', 'field_agent'] as const;
export type AppRole = typeof VALID_ROLES[number];

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Email validation
export function validateEmail(email: unknown): ValidationResult<string> {
  if (typeof email !== 'string') {
    return { success: false, error: 'Email must be a string' };
  }
  
  const trimmed = email.trim().toLowerCase();
  
  if (!trimmed) {
    return { success: false, error: 'Email is required' };
  }
  
  if (trimmed.length > 255) {
    return { success: false, error: 'Email must be less than 255 characters' };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { success: false, error: 'Invalid email format' };
  }
  
  return { success: true, data: trimmed };
}

// Password validation
export function validatePassword(password: unknown): ValidationResult<string> {
  if (typeof password !== 'string') {
    return { success: false, error: 'Password must be a string' };
  }
  
  if (password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters long' };
  }
  
  if (password.length > 72) {
    return { success: false, error: 'Password must be less than 72 characters' };
  }
  
  // Check for at least one uppercase, one lowercase, and one number
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  
  if (!hasUppercase || !hasLowercase || !hasNumber) {
    return { 
      success: false, 
      error: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' 
    };
  }
  
  return { success: true, data: password };
}

// Full name validation
export function validateFullName(name: unknown): ValidationResult<string> {
  if (typeof name !== 'string') {
    return { success: false, error: 'Name must be a string' };
  }
  
  const trimmed = name.trim();
  
  if (!trimmed) {
    return { success: false, error: 'Name is required' };
  }
  
  if (trimmed.length > 255) {
    return { success: false, error: 'Name must be less than 255 characters' };
  }
  
  // Only allow letters, spaces, hyphens, and apostrophes
  const nameRegex = /^[a-zA-Z\s\-'.]+$/;
  if (!nameRegex.test(trimmed)) {
    return { success: false, error: 'Name contains invalid characters' };
  }
  
  return { success: true, data: trimmed };
}

// Phone validation (optional field)
export function validatePhone(phone: unknown): ValidationResult<string | null> {
  if (phone === undefined || phone === null || phone === '') {
    return { success: true, data: null };
  }
  
  if (typeof phone !== 'string') {
    return { success: false, error: 'Phone must be a string' };
  }
  
  const trimmed = phone.trim();
  
  if (trimmed.length > 20) {
    return { success: false, error: 'Phone must be less than 20 characters' };
  }
  
  // Allow digits, plus, minus, spaces, and parentheses
  const phoneRegex = /^[0-9+\-\s()]+$/;
  if (!phoneRegex.test(trimmed)) {
    return { success: false, error: 'Phone contains invalid characters' };
  }
  
  return { success: true, data: trimmed };
}

// Role validation
export function validateRole(role: unknown): ValidationResult<AppRole> {
  if (typeof role !== 'string') {
    return { success: false, error: 'Role must be a string' };
  }
  
  if (!VALID_ROLES.includes(role as AppRole)) {
    return { success: false, error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` };
  }
  
  return { success: true, data: role as AppRole };
}

// UUID validation
export function validateUUID(id: unknown, fieldName: string = 'ID'): ValidationResult<string> {
  if (typeof id !== 'string') {
    return { success: false, error: `${fieldName} must be a string` };
  }
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return { success: false, error: `Invalid ${fieldName} format` };
  }
  
  return { success: true, data: id };
}

// Profile update fields whitelist
export const ALLOWED_PROFILE_FIELDS = ['full_name', 'phone', 'avatar_url', 'is_active'] as const;
export type AllowedProfileField = typeof ALLOWED_PROFILE_FIELDS[number];

export function validateProfileUpdates(updates: unknown): ValidationResult<Record<string, unknown>> {
  if (typeof updates !== 'object' || updates === null) {
    return { success: false, error: 'Updates must be an object' };
  }
  
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(updates)) {
    if (!ALLOWED_PROFILE_FIELDS.includes(key as AllowedProfileField)) {
      continue; // Skip unauthorized fields
    }
    
    if (key === 'full_name') {
      const result = validateFullName(value);
      if (!result.success) return { success: false, error: result.error };
      sanitized[key] = result.data;
    } else if (key === 'phone') {
      const result = validatePhone(value);
      if (!result.success) return { success: false, error: result.error };
      sanitized[key] = result.data;
    } else if (key === 'is_active') {
      if (typeof value !== 'boolean') {
        return { success: false, error: 'is_active must be a boolean' };
      }
      sanitized[key] = value;
    } else if (key === 'avatar_url') {
      if (value !== null && typeof value !== 'string') {
        return { success: false, error: 'avatar_url must be a string or null' };
      }
      if (typeof value === 'string' && value.length > 500) {
        return { success: false, error: 'avatar_url must be less than 500 characters' };
      }
      sanitized[key] = value;
    }
  }
  
  if (Object.keys(sanitized).length === 0) {
    return { success: false, error: 'No valid update fields provided' };
  }
  
  return { success: true, data: sanitized };
}
