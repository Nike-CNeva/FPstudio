
/**
 * Domain: Toast Notifications.
 */

export interface ToastMessage {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
}
