// =====================================================
//  Planilha — gera um arquivo .xlsx de verdade no navegador (sem biblioteca)
//
//  Um .xlsx é um .zip com alguns arquivos XML dentro. Aqui montamos esses XML,
//  juntamos num zip simples (sem compressão) e o navegador baixa o arquivo.
//  O Excel, o LibreOffice e o Google Planilhas abrem normalmente.
//
//  Uso:
//    Planilha.baixar('prospeccoes.xlsx', [{
//      nome: 'Prospecções',
//      colunas: [{ titulo: 'Empresa', tipo: 'texto', largura: 30 }, { titulo: 'Valor', tipo: 'moeda' }],
//      linhas: [['Pet Feliz', 450], ['Barbearia do Zé', 900]],
//      total: { 1: 'soma' },   // opcional: linha de total no fim (soma das colunas pedidas)
//    }]);
//
//  Tipos de coluna: texto, numero, moeda (R$), data, datahora, pct (0,25 → 25%)
// =====================================================
const Planilha = (() => {
  // ---------- estilos (índices usados em s="…") ----------
  // 0 normal · 1 cabeçalho · 2 moeda · 3 data · 4 data e hora · 5 % · 6 número · 7 texto quebrando linha
  // 8 total (negrito) · 9 total moeda · 10 total número
  const ESTILO = { texto: 0, moeda: 2, data: 3, datahora: 4, pct: 5, numero: 6, longo: 7 };
  const ESTILO_TOTAL = { moeda: 9, numero: 10 };

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4">
<numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/>
<numFmt numFmtId="165" formatCode="dd/mm/yyyy"/>
<numFmt numFmtId="166" formatCode="dd/mm/yyyy\\ hh:mm"/>
<numFmt numFmtId="167" formatCode="0%"/>
</numFmts>
<fonts count="2">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEEF0FF"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top style="thin"><color rgb="FF4F46E5"/></top><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="1" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  // ---------- ajudantes ----------
  // tira caracteres que o XML não aceita (o Excel recusaria o arquivo inteiro)
  const limpar = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').slice(0, 32000);
  const xml = (s) => limpar(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // número da coluna → letra (0 → A, 25 → Z, 26 → AA)
  function letra(i) {
    let s = '';
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  }

  // data → número de série do Excel (dias desde 30/12/1899), no horário de quem está usando
  function serieExcel(v, comHora) {
    if (v === null || v === undefined || v === '') return null;
    let d;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const [a, m, dia] = v.split('-').map(Number);
      d = new Date(a, m - 1, dia);
    } else {
      d = v instanceof Date ? v : new Date(v);
    }
    if (Number.isNaN(d.getTime())) return null;
    const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(),
      comHora ? d.getHours() : 0, comHora ? d.getMinutes() : 0, comHora ? d.getSeconds() : 0);
    return (utc - Date.UTC(1899, 11, 30)) / 864e5;
  }

  // nome de aba: até 31 letras, sem : \ / ? * [ ]
  const nomeAba = (s, i) => limpar(s).replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || `Planilha ${i + 1}`;

  function celula(ref, valor, tipo, total) {
    if (valor === null || valor === undefined || valor === '') return '';
    if (['moeda', 'numero', 'pct'].includes(tipo)) {
      const n = Number(valor);
      if (!Number.isFinite(n)) return '';
      const s = total ? (ESTILO_TOTAL[tipo] ?? 8) : ESTILO[tipo];
      return `<c r="${ref}" s="${s}"><v>${n}</v></c>`;
    }
    if (tipo === 'data' || tipo === 'datahora') {
      const n = serieExcel(valor, tipo === 'datahora');
      return n === null ? '' : `<c r="${ref}" s="${ESTILO[tipo]}"><v>${n}</v></c>`;
    }
    // texto: guardado como texto puro (nunca vira fórmula, mesmo começando com "=")
    const s = total ? 8 : (tipo === 'longo' ? ESTILO.longo : 0);
    return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xml(valor)}</t></is></c>`;
  }

  function folha(aba) {
    const cols = aba.colunas;
    const ult = letra(cols.length - 1);
    const linhas = aba.linhas || [];
    let corpo = `<row r="1" ht="22" customHeight="1">${cols.map((c, i) =>
      `<c r="${letra(i)}1" s="1" t="inlineStr"><is><t xml:space="preserve">${xml(c.titulo)}</t></is></c>`).join('')}</row>`;
    linhas.forEach((l, r) => {
      corpo += `<row r="${r + 2}">${cols.map((c, i) => celula(`${letra(i)}${r + 2}`, l[i], c.tipo)).join('')}</row>`;
    });
    // linha de total (calculada aqui, para aparecer certinho até no celular)
    let ultimaLinha = linhas.length + 1;
    if (aba.total && linhas.length) {
      ultimaLinha += 1;
      corpo += `<row r="${ultimaLinha}">${cols.map((c, i) => {
        if (i === 0) return celula(`A${ultimaLinha}`, 'Total', 'texto', true);
        if (aba.total[i] !== 'soma') return `<c r="${letra(i)}${ultimaLinha}" s="8"/>`;
        const soma = Math.round(linhas.reduce((t, l) => t + (Number(l[i]) || 0), 0) * 100) / 100;
        return celula(`${letra(i)}${ultimaLinha}`, soma, c.tipo, true);
      }).join('')}</row>`;
    }
    const larguras = cols.map((c, i) => {
      const auto = Math.max(String(c.titulo).length + 2, ...linhas.slice(0, 200).map((l) => String(l[i] ?? '').length + 2));
      const w = c.largura || Math.min(Math.max(auto, c.tipo === 'moeda' ? 14 : c.tipo === 'data' ? 12 : 8), 60);
      return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
    }).join('');
    const filtro = linhas.length ? `<autoFilter ref="A1:${ult}${linhas.length + 1}"/>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="A1:${ult}${Math.max(ultimaLinha, 1)}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${larguras}</cols>
<sheetData>${corpo}</sheetData>
${filtro}
</worksheet>`;
  }

  // ---------- zip simples (método "store", sem compressão) ----------
  const TAB_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = TAB_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(arquivos) {
    const enc = new TextEncoder();
    const partes = [];
    const central = [];
    let pos = 0;
    // data/hora fixa do DOS (01/01/2020) — o conteúdo é o que importa
    const HORA = 0, DATA = ((2020 - 1980) << 9) | (1 << 5) | 1;
    for (const { nome, conteudo } of arquivos) {
      const n = enc.encode(nome);
      const d = enc.encode(conteudo);
      const crc = crc32(d);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
      local.setUint16(8, 0, true); local.setUint16(10, HORA, true); local.setUint16(12, DATA, true);
      local.setUint32(14, crc, true); local.setUint32(18, d.length, true); local.setUint32(22, d.length, true);
      local.setUint16(26, n.length, true); local.setUint16(28, 0, true);
      partes.push(new Uint8Array(local.buffer), n, d);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true); c.setUint16(12, HORA, true); c.setUint16(14, DATA, true);
      c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true);
      c.setUint16(28, n.length, true); c.setUint32(42, pos, true);
      central.push(new Uint8Array(c.buffer), n);
      pos += 30 + n.length + d.length;
    }
    const tamCentral = central.reduce((t, p) => t + p.length, 0);
    const fim = new DataView(new ArrayBuffer(22));
    fim.setUint32(0, 0x06054b50, true);
    fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true);
    fim.setUint32(12, tamCentral, true); fim.setUint32(16, pos, true);
    return new Blob([...partes, ...central, new Uint8Array(fim.buffer)],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  // ---------- monta o arquivo ----------
  function gerar(abas) {
    const nomes = [];
    abas.forEach((a, i) => {
      let n = nomeAba(a.nome, i);
      while (nomes.includes(n)) n = n.slice(0, 28) + ` ${i + 1}`;
      nomes.push(n);
    });
    const arquivos = [
      { nome: '[Content_Types].xml', conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>` },
      { nome: '_rels/.rels', conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>` },
      { nome: 'docProps/core.xml', conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:creator>${xml(document.title || 'Prospecta')}</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created>
</cp:coreProperties>` },
      { nome: 'docProps/app.xml', conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application></Properties>` },
      { nome: 'xl/workbook.xml', conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView/></bookViews>
<sheets>${nomes.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
<definedNames>${abas.map((a, i) => (a.linhas?.length
    ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(nomes[i]).replace(/'/g, "''")}'!$A$1:$${letra(a.colunas.length - 1)}$${a.linhas.length + 1}</definedName>`
    : '')).join('')}</definedNames>
</workbook>` },
      { nome: 'xl/_rels/workbook.xml.rels', conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },
      { nome: 'xl/styles.xml', conteudo: STYLES },
      ...abas.map((a, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, conteudo: folha(a) })),
    ];
    return zip(arquivos);
  }

  function baixar(nomeArquivo, abas) {
    const blob = gerar(abas);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo.endsWith('.xlsx') ? nomeArquivo : nomeArquivo + '.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  return { gerar, baixar };
})();
