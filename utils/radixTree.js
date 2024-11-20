// utils/radixTree.js
class RadixTreeNode {
    constructor() {
        this.children = {};
        this.isEnd = false;
        this.value = null;
    }
}

class RadixTree {
    constructor() {
        this.root = new RadixTreeNode();
    }

    insert(key, value) {
        let node = this.root;
        for (const char of key) {
            if (!node.children[char]) {
                node.children[char] = new RadixTreeNode();
            }
            node = node.children[char];
        }
        node.isEnd = true;
        node.value = value;
    }

    search(key) {
        let node = this.root;
        for (const char of key) {
            if (!node.children[char]) {
                return null;
            }
            node = node.children[char];
        }
        return node.isEnd ? node.value : null;
    }

    delete(key) {
        const deleteRecursively = (node, depth) => {
            if (!node) return false;
            if (depth === key.length) {
                if (!node.isEnd) return false;
                node.isEnd = false;
                return Object.keys(node.children).length === 0;
            }
            const char = key[depth];
            if (deleteRecursively(node.children[char], depth + 1)) {
                delete node.children[char];
                return !node.isEnd && Object.keys(node.children).length === 0;
            }
            return false;
        };
        deleteRecursively(this.root, 0);
    }
}

module.exports = RadixTree;
