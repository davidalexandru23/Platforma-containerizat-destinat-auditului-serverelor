const { prisma } = require('../lib/prisma');

class ScoringService {
    async calculateScoring(auditRunId) {
        const auditRun = await prisma.auditRun.findUnique({
            where: { id: auditRunId },
            include: {
                templateVersion: {
                    include: {
                        controls: {
                            include: { automatedChecks: true, manualChecks: true },
                        },
                    },
                },
                checkResults: {
                    include: { automatedCheck: { include: { control: true } } },
                },
                manualTaskResults: {
                    include: { manualCheck: { include: { control: true } } },
                },
            },
        });

        if (!auditRun) {
            throw new Error('Audit run not found');
        }

        const excludedIds = auditRun.excludedControlIds || [];

        // Filtreaza pentru controls active
        const activeCheckResults = auditRun.checkResults.filter(
            r => !excludedIds.includes(r.automatedCheck.control.controlId)
        );
        const activeManualTasks = auditRun.manualTaskResults.filter(
            t => !excludedIds.includes(t.manualCheck.control.controlId)
        );

        // Calcule automated
        const totalAutomated = activeCheckResults.length;
        const passedAutomated = activeCheckResults.filter(r => r.status === 'PASS').length;
        const failedAutomated = activeCheckResults.filter(r => r.status === 'FAIL').length;
        const criticalFails = activeCheckResults.filter(
            r => r.status === 'FAIL' && r.automatedCheck.control.severity === 'CRITICAL'
        ).length;

        const automatedCompliancePercent = totalAutomated > 0
            ? (passedAutomated / totalAutomated) * 100
            : 100;

        // Calcule manual
        const totalManual = activeManualTasks.length;
        const completedManual = activeManualTasks.filter(t => t.status === 'COMPLETED').length;
        const pendingManual = activeManualTasks.filter(
            t => t.status === 'PENDING' || t.status === 'IN_PROGRESS'
        ).length;

        const manualCompletionPercent = totalManual > 0
            ? (completedManual / totalManual) * 100
            : 100;

        // Determina status general
        let overallStatus = 'COMPLIANT';

        // Regula: criticalFailOverrides = true
        if (criticalFails > 0) {
            overallStatus = 'NON_COMPLIANT';
        }
        // Regula: manualPendingBlocksCompliant = true
        else if (pendingManual > 0) {
            overallStatus = 'PARTIALLY_COMPLIANT';
        }
        // Alte fail-uri
        else if (failedAutomated > 0) {
            if (automatedCompliancePercent >= 80) {
                overallStatus = 'PARTIALLY_COMPLIANT';
            } else {
                overallStatus = 'NON_COMPLIANT';
            }
        }

        return {
            automatedCompliancePercent: Math.round(automatedCompliancePercent * 100) / 100,
            manualCompletionPercent: Math.round(manualCompletionPercent * 100) / 100,
            overallStatus,
            details: {
                totalAutomated,
                passedAutomated,
                failedAutomated,
                criticalFails,
                totalManual,
                completedManual,
                pendingManual,
            },
        };
    }
}

module.exports = new ScoringService();
