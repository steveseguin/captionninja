// Security utility functions for caption.ninja

/**
 * Checks if a stream ID is considered insecure based on common patterns
 * @param {string} streamId - The stream ID to check
 * @returns {boolean} - True if the stream ID is insecure, false otherwise
 */
function isInsecureStreamId(streamId) {
    // Common insecure stream IDs
    const insecurePatterns = [
        'test', 'demo', 'guest', 'user', 'admin', 'default', 
        'sample', 'example', 'temp', 'temporary', 'public',
        'room', 'stream', 'live', 'broadcast', 'channel',
        'password', '1234', '0000', 'abcd', 'qwerty',
        'welcome', 'hello', 'anonymous', 'anon', 'visitor',
        'cc', 'caption', 'captions', 'english', 'show', 'a',
        'video', 'audio', 'media', 'session', 'meeting',
        'class', 'lecture', 'presentation', 'webinar', 'event',
        'host', 'presenter', 'speaker', 'viewer', 'audience',
        'main', 'primary', 'secondary', 'backup', 'alt',
        'new', 'old', 'first', 'last', 'next', 'previous',
        'home', 'office', 'work', 'personal', 'private',
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
        'saturday', 'sunday', 'weekend', 'weekday', 'today',
        'morning', 'afternoon', 'evening', 'night', 'daily',
        'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul',
        'aug', 'sep', 'oct', 'nov', 'dec', 'january',
        'february', 'march', 'april', 'june', 'july',
        'august', 'september', 'october', 'november', 'december'
    ];
    
    // Convert to lowercase for case-insensitive comparison
    const lowerStreamId = streamId.toLowerCase().trim();
    
    // Check exact matches
    if (insecurePatterns.includes(lowerStreamId)) {
        return true;
    }
    
    // Check patterns with numbers appended (e.g., guest1, user123)
    for (const pattern of insecurePatterns) {
        // Check if streamId starts with pattern followed by numbers
        const regex = new RegExp(`^${pattern}\\d+$`, 'i');
        if (regex.test(lowerStreamId)) {
            return true;
        }
    }
    
    // Check for very short IDs (less than 4 characters)
    if (lowerStreamId.length < 4) {
        return true;
    }
    
    // Check for sequential numbers only
    if (/^\d+$/.test(lowerStreamId)) {
        return true;
    }
    
    // Check for single repeated character
    if (/^(.)\1+$/.test(lowerStreamId)) {
        return true;
    }
    
    return false;
}

/**
 * Creates and displays a security warning for insecure stream IDs
 * @param {string} message - The warning message to display
 * @param {number} duration - How long to show the warning (0 = until dismissed)
 * @returns {HTMLElement} - The warning element
 */
function showSecurityWarning(message, duration = 0) {
    // Remove any existing warnings
    const existingWarning = document.getElementById('stream-security-warning');
    if (existingWarning) {
        existingWarning.remove();
    }
    
    // Create warning container
    const warning = document.createElement('div');
    warning.id = 'stream-security-warning';
    warning.className = 'security-warning';
    // Add critical inline styles as fallback
    warning.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background-color: #dc3545; color: white; padding: 16px 24px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); z-index: 10000; font-family: Arial, sans-serif; min-width: 350px; border: 2px solid #c82333;';
    
    // Create warning content
    const content = document.createElement('div');
    content.className = 'security-warning-content';
    content.style.cssText = 'display: flex; align-items: center; gap: 12px;';
    
    // Add warning icon
    const icon = document.createElement('span');
    icon.className = 'security-warning-icon';
    icon.innerHTML = '⚠️';
    icon.style.cssText = 'font-size: 24px; flex-shrink: 0;';
    
    // Add message
    const messageElement = document.createElement('span');
    messageElement.className = 'security-warning-message';
    messageElement.textContent = message;
    messageElement.style.cssText = 'flex-grow: 1; font-size: 16px; line-height: 1.5; font-weight: 500;';
    
    // Add dismiss button
    const dismissButton = document.createElement('button');
    dismissButton.className = 'security-warning-dismiss';
    dismissButton.innerHTML = '×';
    dismissButton.title = 'Dismiss warning';
    dismissButton.style.cssText = 'background: none; border: none; color: white; font-size: 28px; cursor: pointer; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; opacity: 0.8; line-height: 1;';
    dismissButton.onmouseover = () => dismissButton.style.opacity = '1';
    dismissButton.onmouseout = () => dismissButton.style.opacity = '0.8';
    dismissButton.onclick = () => warning.remove();
    
    // Assemble warning
    content.appendChild(icon);
    content.appendChild(messageElement);
    content.appendChild(dismissButton);
    warning.appendChild(content);
    
    // Add to page
    document.body.appendChild(warning);
    
    // Auto-dismiss after duration if specified
    if (duration > 0) {
        setTimeout(() => {
            if (document.getElementById('stream-security-warning')) {
                warning.style.animation = 'fadeOut 0.3s ease-out';
                setTimeout(() => warning.remove(), 300);
            }
        }, duration);
    }
    
    return warning;
}

/**
 * CSS styles for the security warning
 * This should be added to the page's stylesheet or injected dynamically
 */
const securityWarningStyles = `
<style>
.security-warning {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #dc3545;
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    animation: slideDown 0.3s ease-out;
    max-width: 90%;
    min-width: 350px;
    border: 2px solid #c82333;
}

.security-warning-content {
    display: flex;
    align-items: center;
    gap: 12px;
}

.security-warning-icon {
    font-size: 24px;
    flex-shrink: 0;
}

.security-warning-message {
    flex-grow: 1;
    font-size: 16px;
    line-height: 1.5;
    font-weight: 500;
}

.security-warning-dismiss {
    background: none;
    border: none;
    color: white;
    font-size: 28px;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.8;
    transition: opacity 0.2s;
    flex-shrink: 0;
    line-height: 1;
}

.security-warning-dismiss:hover {
    opacity: 1;
}

@keyframes slideDown {
    from {
        transform: translateX(-50%) translateY(-100%);
        opacity: 0;
    }
    to {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
    }
}

@keyframes fadeOut {
    from {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
    }
    to {
        opacity: 0;
        transform: translateX(-50%) translateY(-20px);
    }
}

/* Mobile responsive */
@media (max-width: 600px) {
    .security-warning {
        top: 10px;
        left: 10px;
        right: 10px;
        transform: none;
        max-width: none;
        min-width: auto;
    }
    
    @keyframes slideDown {
        from {
            transform: translateY(-100%);
            opacity: 0;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }
    
    @keyframes fadeOut {
        from {
            opacity: 1;
            transform: translateY(0);
        }
        to {
            opacity: 0;
            transform: translateY(-20px);
        }
    }
}
</style>
`;

// Function to inject styles if not already present
function injectSecurityStyles() {
    if (!document.getElementById('security-warning-styles')) {
        // Create a proper style element
        const styleElement = document.createElement('style');
        styleElement.id = 'security-warning-styles';
        styleElement.textContent = securityWarningStyles.replace('<style>', '').replace('</style>', '');
        document.head.appendChild(styleElement);
    }
}