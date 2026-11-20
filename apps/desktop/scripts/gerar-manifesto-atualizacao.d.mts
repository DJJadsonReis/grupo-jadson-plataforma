export interface OpcoesManifesto {
  versao: string;
  baseUrl: string;
  nomeArquivo: string;
  assinatura: string;
  notas?: string;
  dataPublicacao?: Date;
}

export function montarManifesto(opcoes: OpcoesManifesto): {
  version: string;
  notes?: string;
  pub_date: string;
  platforms: Record<string, { signature: string; url: string }>;
};

export function executarCli(args?: string[]): Promise<void>;
