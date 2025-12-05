# Configuração do Webhook do Resend

Este documento explica como configurar o webhook do Resend para rastreamento de eventos de email (aberturas, cliques, bounces, etc.) no AfterMeeting.

## Pré-requisitos

1. Conta no Resend (https://resend.com)
2. Domínio verificado no Resend
3. Edge function `resend-webhook` já deployada

## Passos para Configuração

### 1. Obter URL do Webhook

A URL do webhook é:
```
https://hjnxjmenfhhoqcsjvrzj.supabase.co/functions/v1/resend-webhook
```

### 2. Configurar Webhook no Resend

1. Aceda ao dashboard do Resend: https://resend.com/webhooks
2. Clique em **"Add Webhook"**
3. Preencha os campos:
   - **Endpoint URL**: Cole a URL do webhook acima
   - **Events**: Selecione os eventos que deseja rastrear:
     - ✅ `email.sent` - Email enviado
     - ✅ `email.delivered` - Email entregue
     - ✅ `email.opened` - Email aberto
     - ✅ `email.clicked` - Link clicado
     - ✅ `email.bounced` - Email rejeitado
     - ✅ `email.complained` - Reclamação de spam
     - ✅ `email.delivery_delayed` - Entrega atrasada
4. Clique em **"Create Webhook"**

### 3. Testar o Webhook

1. No dashboard do Resend, localize o webhook criado
2. Clique em **"Send Test Event"**
3. Verifique os logs da edge function para confirmar recepção:
   - Aceda ao painel Cloud do Lovable
   - Navegue para Functions → resend-webhook
   - Verifique os logs recentes

### 4. Verificar Dados

Após configurar o webhook:

1. Envie um email de teste através da aplicação
2. Aceda à página **Email Analytics** em `/email-analytics`
3. Verifique se os eventos estão a ser registados:
   - Total Enviados
   - Taxa de Entrega
   - Taxa de Abertura
   - Taxa de Cliques

## Eventos Rastreados

| Evento Resend | Tipo no Sistema | Descrição |
|---------------|-----------------|-----------|
| `email.sent` | sent | Email enviado com sucesso |
| `email.delivered` | delivered | Email entregue ao destinatário |
| `email.opened` | opened | Destinatário abriu o email |
| `email.clicked` | clicked | Destinatário clicou num link |
| `email.bounced` | bounced | Email rejeitado (endereço inválido) |
| `email.complained` | complained | Destinatário marcou como spam |
| `email.delivery_delayed` | failed | Entrega atrasada/falhada |

## Estrutura de Dados

Os eventos são guardados na tabela `email_events` com:
- `email_action_id`: Referência à ação de email
- `user_id`: ID do utilizador que enviou o email
- `event_type`: Tipo de evento (sent, delivered, opened, etc.)
- `recipient_email`: Email do destinatário
- `external_id`: ID do email no Resend
- `event_data`: Dados completos do evento em JSON
- `created_at`: Data/hora do evento

## Troubleshooting

### Webhook não está a receber eventos

1. Verifique se a URL do webhook está correta
2. Confirme que a edge function está deployada
3. Verifique os logs da edge function para erros
4. Teste com "Send Test Event" no Resend

### Eventos não aparecem no dashboard

1. Verifique se `external_id` está a ser gravado nos emails enviados
2. Confirme que a função `send-email` está atualizada
3. Verifique as políticas RLS da tabela `email_events`
4. Consulte os logs da edge function para erros

### Taxa de abertura é 0%

- A taxa de abertura depende de o destinatário:
  1. Permitir carregamento de imagens no email
  2. Abrir o email em cliente que suporta tracking
  - Taxas baixas são normais (média indústria: 15-25%)

## Segurança

- O webhook é **público** (sem autenticação JWT)
- Validação básica de estrutura de dados via Zod
- Eventos órfãos (sem email_action) são registados mas sem associação
- RLS policies garantem que utilizadores só veem seus próprios eventos

## Métricas Calculadas

### Taxa de Entrega
```
(emails entregues / emails enviados) × 100
```

### Taxa de Abertura  
```
(emails abertos / emails entregues) × 100
```

### Taxa de Cliques
```
(emails com cliques / emails abertos) × 100
```

### Taxa de Rejeição
```
(emails rejeitados / emails enviados) × 100
```

## Suporte

Para questões sobre:
- Configuração Resend: https://resend.com/docs
- Edge Functions: Documentação Lovable Cloud
- Problemas técnicos: Verifique logs e consulte equipa de desenvolvimento
