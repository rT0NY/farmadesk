export const ROLES = {
  ADMIN: 'admin',
  ENCARGADO: 'encargado',
  CAJERO: 'cajero',
}

export const ETIQUETAS_ROL = {
  admin: 'Administrador',
  encargado: 'Encargado',
  cajero: 'Cajero',
}

export const METODOS_PAGO = [
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'mixto', etiqueta: 'Mixto' },
]

export const CATEGORIAS_GASTO = [
  { valor: 'insumos', etiqueta: 'Insumos' },
  { valor: 'servicios', etiqueta: 'Servicios' },
  { valor: 'mantenimiento', etiqueta: 'Mantenimiento' },
  { valor: 'transporte', etiqueta: 'Transporte' },
  { valor: 'papeleria', etiqueta: 'Papelería' },
  { valor: 'otros', etiqueta: 'Otros' },
]

export const DIAS_SEMANA = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
]

export const CATEGORIAS_PRODUCTO = [
  'Analgésicos',
  'Antibióticos',
  'Antiinflamatorios',
  'Antigripales',
  'Antialérgicos',
  'Hipertensión',
  'Diabetes',
  'Vitaminas',
  'Antiácidos',
  'Dermatología',
  'Oftalmología',
  'Curación',
  'Higiene',
  'Bebé',
  'Suplementos',
  'Botanas',
  'Bebidas',
  'Otros',
]