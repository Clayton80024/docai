/**
 * Render template by replacing {{variable}} placeholders with actual values
 * 
 * @param template - Template string with {{variable}} placeholders
 * @param data - Object containing variable values
 * @returns Rendered template with variables replaced
 */
export function renderTemplate(
  template: string,
  data: Record<string, string | undefined>
): string {
  return template.replace(/\{\{(.*?)\}\}/g, (_, key) => {
    const trimmedKey = key.trim();
    const value = data[trimmedKey];
    
    // If value is undefined or empty string, keep the placeholder
    if (value === undefined || value === "") {
      return `{{${trimmedKey}}}`;
    }
    
    return value;
  });
}

