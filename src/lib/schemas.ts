import { z } from 'zod';

export const exporterSchema = z.object({
  exporterId: z.string().min(1, 'El ID de exportador es obligatorio'),
  name: z.string().min(1, 'El nombre es obligatorio'),
  type: z.string().min(1, 'El tipo es obligatorio'),
});

export const producerSchema = z.object({
  producerId: z.string().min(1, 'El ID de productor es obligatorio'),
  shortName: z.string().min(1, 'El nombre corto es obligatorio'),
  name: z.string().min(1, 'El nombre es obligatorio'),
  exporterId: z.string().min(1, 'El ID de exportador es obligatorio'),
});

export const binMaterialSchema = z.object({
  code: z.string().min(1, 'El código es obligatorio'),
  name: z.string().min(1, 'El nombre es obligatorio'),
  exporterId: z.string().min(1, 'El ID de exportador es obligatorio'),
  type: z.string().min(1, 'El tipo es obligatorio'),
});

export const otherClientSchema = z.object({
  clientId: z.string().min(1, 'El ID de cliente es obligatorio'),
  name: z.string().min(1, 'El nombre es obligatorio'),
  type: z.string().min(1, 'El tipo es obligatorio'),
});

export const packagingMasterSchema = z.object({
  code: z.string().min(1, 'El código es obligatorio'),
  name: z.string().min(1, 'El nombre es obligatorio'),
  clientId: z.string().min(1, 'El ID de cliente es obligatorio'),
});

export const userMasterSchema = z.object({
  userName: z.string().min(1, 'El nombre de usuario es obligatorio'),
  profileId: z.string().min(1, 'El ID de perfil es obligatorio'),
});

export const profileSchema = z.object({
  profileId: z.string().min(1, 'El ID de perfil es obligatorio'),
  name: z.string().min(1, 'El nombre es obligatorio'),
  modulesAccess: z.string().min(1, 'El acceso a módulos es obligatorio').transform(val => val.split(',').map(s => s.trim())),
});
