// Bot mode is set via VITE_BOT_MODE env variable.
// 'client'  — client bot (@vestavto_client_bot): always client UI, isManager forced to false
// 'manager' — manager bot (@vestavto_manager_bot): checks manager role, shows admin panel or access denied
export const BOT_MODE = (import.meta.env.VITE_BOT_MODE as string) || 'client'
export const isClientBot = BOT_MODE === 'client'
export const isManagerBot = BOT_MODE === 'manager'
