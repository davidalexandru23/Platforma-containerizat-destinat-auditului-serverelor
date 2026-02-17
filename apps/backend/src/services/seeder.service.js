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
                // Import sau Update (verificare versiune)
                console.log(`[SEEDER_DEBUG] Processing template: "${pt.name}" | File Version: ${pt.version}`);
                const content = await templatesService.getPredefinedTemplateContent(pt.filename);
                const result = await templatesService.importOrUpdatePredefinedTemplate(content);

                if (result.updated) {
                    log.success(`Template "${pt.name}" updated to version ${result.version || 'new'}`);
                    seededCount++;
                } else if (result.skipped) {
                    log.info(`Template "${pt.name}" already up to date.`);
                } else {
                    log.success(`Template "${pt.name}" seeded successfully.`);
                    seededCount++;
                }

            } catch (e) {
                console.error(`[SEEDER_ERROR] Failed to seed template ${pt.filename}:`, e);
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
