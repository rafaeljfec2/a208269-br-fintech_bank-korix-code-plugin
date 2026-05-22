# Descrição
Adicione uma descrição clara e concisa do que essa PR faz.

# O que a PR faz
- Liste todas as alterações feitas nesta PR.
- Inclua informações sobre novos endpoints, documentação, etc.

# Evidências de Teste
- Adicione imagens que comprovem o teste.
- Inclua requests feitas, comandos e linhas no banco.

# Observações ao revisor
- Adicione quaisquer observações relevantes ao revisor, como dependências externas ou configurações de ambiente.
- Caso exista configurações de ambiente fornecer o ticket do mesmo

# Code Review Checklist
Os itens a seguir devem sempre ser validados durante as revisões de código, antes que uma solicitação pull seja aceita:
- [ ] O PR é pequeno e fácil de ler (Máx. 500 linhas)
- [ ] A qualidade do código é alta (o código não é complexo, evitando classes e métodos rasos, evitando código duplicado, etc)
- [ ] O código é legível (os nomes são precisos, consistentes e não vagos, o código é óbvio e não obscuro)
- [ ] Os novos arquivos estão na pasta correta
- [ ] Os nomes dos arquivos Flyway seguem o padrão: **V[yymmddhhmmss]_[change description].sql**
- [ ] Os novos arquivos estão usando a nomenclatura correta
- [ ] Nova interface, classe e enums estão usando a nomenclatura correta
- [ ] Entenda como oferecer suporte e manter o novo código
- [ ] Testes de unidade foram adicionados para as mudanças
- [ ] Os testes de unidade seguem o padrão: **givenPreconditionsWhenStateUnderTestThenExpectedBehavior**
- [ ] Casos extremos foram considerados nos testes
- [ ] Teste retroativo, se necessário, foi feito
- [ ] Evidências, tickets e outras dependências externas foram adicionadas no PR