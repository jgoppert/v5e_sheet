import json
from jinja2 import Environment, FileSystemLoader

def flatten_tree(tree, props=None):
    if props is None:
        props = list(tree.keys())
        props.remove("fields")

    # flatten properties in json tree
    if "fields" in tree.keys():
        for field_name, field in tree["fields"].items():
            #print('field', field_name)
            for prop in props:
                #print('prop', prop)
                if prop in tree.keys() and not prop in field.keys():
                    #print('using tree value')
                    field[prop] = tree[prop]
            flatten_tree(field, props)

with open('data.json', 'r') as f:
    json_txt = f.read()
    data = json.loads(json_txt)
    # flatten properties to make rendering easier and json non-cluttered
    flatten_tree(data["sections"])
    # print, removing all white space
    data['json_txt'] = json.dumps(data, separators=(',',':'))

with open('worker.js', 'r') as f:
    data['worker_js'] = f.read()

jinja_env = Environment(
    loader=FileSystemLoader('.'),
    extensions=['jinja2.ext.do']
)

with open('V5e.html', 'w') as f:
    f.write(jinja_env.get_template('V5e.jinja').render(d=data))

print('character sheet generated! Upload V5e.html and V5e.css to roll20.')
