"""Extract ONCE search results without executing HTML or returning session links."""
import json
import re
from urllib.parse import urlsplit, urljoin, parse_qs, urlencode
from lxml import html

def clean(node):
    return ' '.join(node.text_content().split())

def safe_link(value, base):
    u=urlsplit(urljoin(base,value));origin=urlsplit(base)
    if (u.scheme,u.netloc)!=(origin.scheme,origin.netloc):return None
    if u.path not in ('/once/viewer','/once/docviewer'):return None
    obj=parse_qs(u.query).get('objectId',[''])[0]
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,128}',obj):return None
    return u.path+'?'+urlencode({'objectId':obj})

def normalize(raw, mode, base):
    if mode=='once_json':
        data=json.loads(raw.decode('utf-8-sig'))
        if not isinstance(data,dict) or not isinstance(data.get('resultList'),list):
            raise ValueError('unexpected ONCE JSON')
        items=[]
        for item in data['resultList']:
            fields={}
            for group in ('firstFields','secondFields','thirdFields','otherFields'):
                for field in item.get(group,[]):
                    fields[str(field.get('code',''))]=str(field.get('value',''))
            items.append({'objectId':item.get('id'),'title':item.get('title'),
                'description':item.get('description'),'fields':fields,
                'url':safe_link(item.get('url',''),base),
                'latest':item.get('NEW'),'invalid':item.get('INV')})
        return {'items':items,'recordCount':data.get('recordCount'),
                'pageCount':data.get('pageCount'),'currentPageIndex':data.get('currentPageIndex'),
                'searchParams':data.get('searchParams',{}),'scope':'当前页，非全部结果'}
    text=raw.decode('utf-8-sig')
    tree=html.fromstring(text)
    # Keep only data content; do not expose scripts, forms, embedded authenticated URLs.
    for node in tree.xpath('//script|//style|//iframe|//form|//input'):
        node.drop_tree()
    if mode=='once_search':
        roots=tree.xpath('//*[@id="dataGreat"]')
        if not roots:raise ValueError('ONCE result container missing: possible expired session')
        items=[]
        for node in roots[0].xpath('./div[contains(@class,"serach_list_div")]'):
            links=node.xpath('.//h5/a[@href]')
            if not links:continue
            link=links[0];url=safe_link(link.get('href'),base)
            items.append({'title':clean(link),'url':url,'text':clean(node)})
        result={'items':items,'scope':'当前页，非全部结果'}
        for js,key in [('totalPage','pageCount'),('currPage','currentPageIndex'),('number','recordCount')]:
            match=re.search(r'var\s+'+js+r'\s*=\s*(\d+)\s*;',text)
            if match:result[key]=int(match[1])
        # Parse state separately from hidden input without exposing other input fields.
        state=html.fromstring(text).xpath('//input[@id="searchParams"]/@value')
        if state:result['searchParams']=json.loads(state[0])
        return result
    if mode=='once_detail':
        tables=tree.xpath('//table[contains(@class,"doc-table")]')
        if not tables:raise ValueError('ONCE detail missing: possible expired session')
        return {'tables':[[[clean(c) for c in row.xpath('./th|./td')] for row in table.xpath('.//tr')] for table in tables],
                'scope':'文档属性与关联表；不含PDF正文，不自动下载附件'}
    raise ValueError('unknown ONCE response mode')
