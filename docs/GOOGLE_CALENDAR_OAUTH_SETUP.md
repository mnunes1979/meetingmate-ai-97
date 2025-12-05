# Configuração do Google Calendar OAuth - Resolver Erro 403

## Problema
Quando tenta conectar o Google Calendar, recebe o erro:
```
Erro 403: access_denied
A app hjnxjmenfhhoqcsjvrzj.supabase.co não concluiu o processo de validação da Google
```

## Causa
Este erro ocorre porque a aplicação está em **modo de teste** no Google Cloud Console. Em modo de teste, apenas utilizadores explicitamente adicionados como "test users" podem fazer login.

## Solução: Adicionar Test Users

### Passo 1: Aceder ao Google Cloud Console
1. Aceda a [Google Cloud Console](https://console.cloud.google.com)
2. Selecione o seu projeto

### Passo 2: Ir para o Ecrã de Consentimento OAuth
1. No menu lateral, vá para **APIs & Services** > **OAuth consent screen**
2. Ou use este link direto: https://console.cloud.google.com/apis/credentials/consent

### Passo 3: Adicionar Test Users
1. Na secção **Test users**, clique em **+ ADD USERS**
2. Adicione os emails dos utilizadores que devem ter acesso:
   - Adicione o seu email pessoal
   - Adicione emails de todos os membros da equipa que vão usar a aplicação
3. Clique em **SAVE**

### Passo 4: Testar a Conexão
1. Volte à aplicação
2. Vá para **Configuração** > **Google Calendar**
3. Clique em **Conectar Google Calendar**
4. Faça login com um dos emails adicionados como test user
5. Aceite as permissões solicitadas

## Publicar a Aplicação (Opcional - Para Produção)

Se quiser que qualquer utilizador possa conectar sem adicionar como test user:

### Passo 1: Completar o Ecrã de Consentimento
1. Preencha todas as informações obrigatórias:
   - **App name**: Nome da sua aplicação
   - **User support email**: Email de suporte
   - **Developer contact information**: Seu email
   - **App logo**: Logo da aplicação (opcional mas recomendado)
   - **App domain**: Domínio da aplicação
   - **Privacy Policy**: Link para política de privacidade
   - **Terms of Service**: Link para termos de serviço

### Passo 2: Configurar Scopes
Verifique se os seguintes scopes estão adicionados:
- `.../auth/userinfo.email`
- `.../auth/userinfo.profile`
- `openid`
- `https://www.googleapis.com/auth/calendar`

### Passo 3: Submeter para Verificação
1. Clique em **PUBLISH APP**
2. Mude o status de "Testing" para "In production"
3. Se usar scopes sensíveis (como calendar), pode ser necessário submeter para revisão do Google

**Nota**: O processo de verificação do Google pode demorar várias semanas para aplicações que usam scopes sensíveis.

## Solução Rápida (Recomendada para Desenvolvimento)

Para já, a solução mais rápida é **adicionar test users**. Isto permite que você e a sua equipa usem a funcionalidade imediatamente sem esperar pela verificação do Google.

## URIs Configurados

Certifique-se que as seguintes URIs estão configuradas no OAuth Client:

**Authorized JavaScript origins**:
- `https://bb1f29bc-228f-49b7-8938-2988dea6c547.lovableproject.com`
- `https://hjnxjmenfhhoqcsjvrzj.supabase.co`

**Authorized redirect URIs**:
- `https://hjnxjmenfhhoqcsjvrzj.supabase.co/functions/v1/google-oauth-callback`

## Credenciais Atuais

As credenciais já estão configuradas no backend:
- ✅ Client ID configurado
- ✅ Client Secret configurado
- ✅ Redirect URI configurado
- ⚠️ Test users precisam ser adicionados

## Suporte

Se continuar com problemas:
1. Verifique se o email está na lista de test users
2. Limpe o cache do navegador
3. Tente com uma janela anónima
4. Verifique os logs da aplicação
