import { doc, getDoc, Firestore } from 'firebase/firestore';
import type { OtherFruitReception } from './types';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

/**
 * Obtiene la configuración de Telegram desde Firestore con fallback a variables de entorno.
 */
export async function getTelegramConfig(firestore: Firestore): Promise<TelegramConfig> {
  try {
    const docRef = doc(firestore, 'settings', 'telegram');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        botToken: data.botToken || process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN || '',
        chatId: data.chatId || process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID || '',
      };
    }
  } catch (error) {
    console.error('Error al obtener la configuración de Telegram desde Firestore:', error);
  }
  return {
    botToken: process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID || '',
  };
}

/**
 * Envía un mensaje a un chat de Telegram mediante la API HTTP de Telegram.
 */
export async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<boolean> {
  if (!botToken || !chatId) {
    console.warn('Falta el Token del Bot o el Chat ID de Telegram. No se puede enviar el mensaje.');
    return false;
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error de la API de Telegram:', errorText);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error al enviar el mensaje de Telegram:', error);
    return false;
  }
}

/**
 * Envía una notificación formateada a Telegram cuando se completa el almacenamiento de un Pallet Log.
 */
export async function notifyPalletLogStored(firestore: Firestore, reception: OtherFruitReception): Promise<void> {
  const config = await getTelegramConfig(firestore);
  if (!config.botToken || !config.chatId) {
    console.log('Telegram no está configurado. Se omite la notificación.');
    return;
  }

  // Calcular la cantidad total de Bins de forma robusta
  const totalBins = (reception.items || []).reduce((sum, item) => {
    // Si es Fall Creek y está en Pallets, al descomponerse se registran en Bins.
    // Esta fórmula cubre cualquier caso multiplicando según la unidad de la línea
    const isFC = reception.clientName?.toUpperCase() === 'FALL CREEK';
    const multiplier = (isFC && item.unit === 'Pallets') ? 3 : (item.unit === 'Bins' ? 1 : 2);
    return sum + ((item.quantity || 0) * multiplier);
  }, 0);

  // Obtener y formatear fecha/hora (uso horario Santiago de Chile)
  const date = reception.updatedAt?.toDate ? reception.updatedAt.toDate() : new Date();
  const formattedDate = date.toLocaleString('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const message = 
    `✅ *Pallet Log Almacenado Completamente*\n\n` +
    `*Socio Comercial:* ${reception.clientName || 'N/A'}\n` +
    `*Nombre del Pallet Log:* ${reception.document || 'N/A'}\n` +
    `*Fecha / Hora:* ${formattedDate}\n` +
    `*Cantidad de Bins:* ${totalBins}\n\n` +
    `*Estado:* Operación Correcta`;

  const success = await sendTelegramMessage(config.botToken, config.chatId, message);
  if (success) {
    console.log(`Notificación de Telegram enviada exitosamente para el Pallet Log: ${reception.document}`);
  } else {
    console.warn(`No se pudo enviar la notificación de Telegram para el Pallet Log: ${reception.document}`);
  }
}

/**
 * Envía una notificación formateada a Telegram cuando se inicia/carga un Pallet Log.
 */
export async function notifyPalletLogStarted(firestore: Firestore, reception: OtherFruitReception): Promise<void> {
  const config = await getTelegramConfig(firestore);
  if (!config.botToken || !config.chatId) {
    console.log('Telegram no está configurado. Se omite la notificación.');
    return;
  }

  // Calcular la cantidad total de Bins
  const totalBins = (reception.items || []).reduce((sum, item) => {
    const isFC = reception.clientName?.toUpperCase() === 'FALL CREEK';
    const multiplier = (isFC && item.unit === 'Pallets') ? 3 : (item.unit === 'Bins' ? 1 : 2);
    return sum + ((item.quantity || 0) * multiplier);
  }, 0);

  // Obtener y formatear fecha/hora (Santiago de Chile)
  const date = new Date();
  const formattedDate = date.toLocaleString('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const message = 
    `📤 *Pallet Log Iniciado / Cargado*\n\n` +
    `*Socio Comercial:* ${reception.clientName || 'N/A'}\n` +
    `*Nombre del Pallet Log:* ${reception.document || 'N/A'}\n` +
    `*Fecha / Hora:* ${formattedDate}\n` +
    `*Cantidad de Bins:* ${totalBins}\n\n` +
    `*Estado:* Ingresado - Pendiente de Recepción`;

  const success = await sendTelegramMessage(config.botToken, config.chatId, message);
  if (success) {
    console.log(`Notificación de inicio de Telegram enviada para: ${reception.document}`);
  } else {
    console.warn(`No se pudo enviar la notificación de inicio de Telegram para: ${reception.document}`);
  }
}

