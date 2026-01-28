import { prisma } from '../lib/prisma.js';
import * as templatesService from './templates.service.js';
import { log } from '../lib/logger.js';

async function seedTemplates() {
    try {
        log.info('Checking predefined templates...');

        const predefinedTemplates = await templatesService.getPredefinedTemplates();

        if (predefinedTemplates.length === 0) {
            log.warn('No predefined templates found in templates directory.');
            return;
        }

        let seededCount = 0;

        for (const pt of predefinedTemplates) {
            try {
                // Verificare daca template-ul exista dupa nume
                const existing = await prisma.template.findFirst({
                    where: { name: pt.name }
                });

                if (existing) {
                    log.info(`Template "${pt.name}" already exists. Skipping.`);
                    continue;
                }

                log.info(`Seeding template: ${pt.name} (${pt.filename})`);
                const content = await templatesService.getPredefinedTemplateContent(pt.filename);

                await templatesService.importJson(content, null); // CreatedBy = null (Sistem)
                seededCount++;

            } catch (e) {
                log.error(`Failed to seed template ${pt.filename}: ${e.message}`);
            }
        }

        if (seededCount > 0) {
            log.success(`Successfully seeded ${seededCount} new templates.`);
        } else {
            log.info('All predefined templates already exist.');
        }

    } catch (error) {
        log.error(`Error during template seeding: ${error.message}`);
    }
}

export {
    seedTemplates,
};
