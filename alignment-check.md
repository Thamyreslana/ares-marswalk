# ARES — Conferência visual entre imagem e terreno / Image–terrain check

**Estado / Status: PENDENTE / NOT PERFORMED.**

Este é um roteiro e modelo de registro. Nenhuma observação ou aprovação foi preenchida. A conferência visual pode revelar inconsistências evidentes; não estabelece precisão geodésica nem certifica uma rota para pessoas.

This is a protocol and blank record template. No observation or approval has been entered. Visual checking can reveal obvious inconsistencies; it does not establish geodetic accuracy or certify a human route.

## Preparação / Preparation

1. Registre a versão ou commit, data e responsável. Preserve os hashes e parâmetros do [cenário de referência](assets/validation-report.json).
   Record the version or commit, date and observer. Retain the hashes and parameters from the reference scenario.
2. Compare a imagem CTX e o DEM usando uma ferramenta ou conversão independente da usada no ARES. Registre produto, URL, projeção, referência de longitude e resolução. [NASA Mars Trek](https://trek.nasa.gov/mars/) e o produto USGS citado no cenário são pontos de partida; estar na mesma projeção não comprova alinhamento absoluto.
   Compare CTX imagery and the DEM using a tool or conversion independent of the ARES conversion. Record product, URL, projection, longitude convention and resolution. Matching projections alone do not prove absolute alignment.
3. Escolha pelo menos três feições reconhecíveis e distribuídas pelo recorte, como bordas de crateras ou cristas. Não use só pontos na mesma região. Rochette é um waypoint do rover; não presuma que seja o centro de um furo visível.
   Choose at least three identifiable features distributed across the subset, such as crater rims or ridges. Rochette is a rover workspace waypoint, not necessarily a visible drill-hole center.
4. Compare as posições nos dois produtos, salve capturas com escala e registre discrepâncias. Se não puder identificar uma feição de forma inequívoca, marque **inconclusivo**. Não atribua um erro em metros sem uma medição reproduzível e sua incerteza.
   Compare positions in both products, retain screenshots with scale and record discrepancies. Mark ambiguous features **inconclusive**. Do not assign metre accuracy without a reproducible measurement and its uncertainty.

## Registro em branco / Blank record

- Versão ou commit / Version or commit:
- Data e responsável / Date and observer:
- Produtos, URLs, projeções e ferramenta independente / Products, URLs, projections and independent tool:
- Caminhos das capturas / Screenshot references:

| Feição / Feature | Posição ou referência no CTX / CTX reference | Posição ou referência no DEM / DEM reference | Discrepância e evidência / Discrepancy and evidence | Resultado / Outcome |
| --- | --- | --- | --- | --- |
| 1 — preencher / complete | | | | Não avaliado / Not assessed |
| 2 — preencher / complete | | | | Não avaliado / Not assessed |
| 3 — preencher / complete | | | | Não avaliado / Not assessed |

Resultados possíveis: consistência visual, suspeita de desalinhamento ou inconclusivo. Registre também falhas e feições descartadas. Uma observação de consistência visual não é validação geodésica independente.

Possible outcomes: visually consistent, suspected mismatch or inconclusive. Record failures and rejected landmarks too. Visual consistency is not independent geodetic validation.

## Depois da conferência / After checking

- Documente problemas, mudanças e o que precisa ser repetido. Preserve o registro original.
- Teste separadamente a compreensão com [alguém de fora do projeto](comprehension-test.html?lang=pt), sem mostrar a demo antes das tarefas.
- O roteiro não altera automaticamente os campos `independentAbsoluteImageDemAlignmentValidated`, `humanUsabilityStudyCompleted` ou `operationalSafetyValidated` do relatório. As verificações continuam pendentes até haver evidência real e revisão do alcance da afirmação.

Document issues, changes and what must be repeated. Keep the original record. Run the [comprehension test](comprehension-test.html?lang=en) separately, before showing the guided demo. This protocol never updates validation flags automatically; actual observations and review of the claim are required.
