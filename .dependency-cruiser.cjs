/**
 * Regras de camada (arquitetura limpa por módulo): src/<módulo>/{domain,application,infrastructure,http}.
 * `npm run depcruise` falha se alguma seta apontar para fora.
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'domain-puro',
      comment:
        'O domínio não importa nada de fora do domínio: nem application, nem infraestrutura, nem HTTP, nem pacotes npm, nem módulos do Node.',
      severity: 'error',
      from: { path: '^src/[^/]+/domain/' },
      to: { pathNot: '^src/[^/]+/domain/' },
    },
    {
      name: 'application-sem-detalhes',
      comment:
        'Casos de uso dependem só do domínio e de portas; nunca de infraestrutura, HTTP, bootstrap ou pacotes npm.',
      severity: 'error',
      from: { path: '^src/[^/]+/application/' },
      to: {
        pathNot: '^src/[^/]+/(domain|application)/',
        dependencyTypesNot: ['core'],
      },
    },
    {
      name: 'infraestrutura-sem-http',
      comment: 'Adaptadores de saída não conhecem a camada HTTP nem o bootstrap.',
      severity: 'error',
      from: { path: '^src/[^/]+/infrastructure/' },
      to: { path: '^src/([^/]+/http|bootstrap)/' },
    },
    {
      name: 'http-sem-infraestrutura',
      comment: 'Rotas falam com casos de uso; quem liga as implementações é o src/bootstrap/container.ts.',
      severity: 'error',
      from: { path: '^src/[^/]+/http/' },
      to: { path: '^src/[^/]+/infrastructure/' },
    },
    {
      name: 'sem-ciclos',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'sem-orfaos',
      severity: 'warn',
      from: { orphan: true, pathNot: '\\.d\\.ts$' },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.js'],
    },
  },
};
